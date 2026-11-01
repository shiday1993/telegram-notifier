
const JSON_HEADERS = {
    "Content-Type": "application/json; charset=utf-8"
};

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: JSON_HEADERS
    });
}

function isAuthorized(request, env) {
    const apiKey = request.headers.get("X-API-Key");

    return Boolean(
        env.API_KEY &&
        apiKey &&
        apiKey === env.API_KEY
    );
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // Health check
        if (url.pathname === "/health" && request.method === "GET") {
            return jsonResponse({
                success: true,
                service: "telegram-notifier",
                status: "running"
            });
        }

        // Send message
        if (url.pathname === "/send_message") {
            if (request.method !== "POST") {
                return jsonResponse({
                    success: false,
                    error: "Method not allowed"
                }, 405);
            }

            // Authentication
            if (!isAuthorized(request, env)) {
                return jsonResponse({
                    success: false,
                    error: "Unauthorized"
                }, 401);
            }

            // Parse JSON
            let body;

            try {
                body = await request.json();
            } catch {
                return jsonResponse({
                    success: false,
                    error: "Invalid JSON body"
                }, 400);
            }

            const message = body.message;
            const chatId = body.chat_id || env.DEFAULT_CHAT_ID;
            const parseMode = body.parse_mode;

            // Validate message
            if (typeof message !== "string" || !message.trim()) {
                return jsonResponse({
                    success: false,
                    error: "Message is required"
                }, 400);
            }

            if (message.length > 4096) {
                return jsonResponse({
                    success: false,
                    error: "Message exceeds Telegram's 4096 character limit"
                }, 400);
            }

            if (!chatId) {
                return jsonResponse({
                    success: false,
                    error: "Chat ID is not configured"
                }, 400);
            }

            if (
                parseMode &&
                !["HTML", "Markdown", "MarkdownV2"].includes(parseMode)
            ) {
                return jsonResponse({
                    success: false,
                    error: "Unsupported parse_mode"
                }, 400);
            }

            if (!env.TELEGRAM_BOT_TOKEN) {
                return jsonResponse({
                    success: false,
                    error: "Telegram bot token is not configured"
                }, 500);
            }

            // Send to Telegram
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            try {
                const telegramResponse = await fetch(
                    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            chat_id: chatId,
                            text: message,
                            ...(parseMode ? { parse_mode: parseMode } : {})
                        }),
                        signal: controller.signal
                    }
                );

                const result = await telegramResponse.json();

                if (!telegramResponse.ok || !result.ok) {
                    return jsonResponse({
                        success: false,
                        error: "Telegram API request failed",
                        telegram_error: result.description || "Unknown Telegram error",
                        telegram_error_code: result.error_code || telegramResponse.status
                    }, 502);
                }

                return jsonResponse({
                    success: true,
                    message: "Message sent successfully",
                    message_id: result.result.message_id,
                    chat_id: result.result.chat.id
                });

            } catch (error) {
                const isTimeout = error.name === "AbortError";

                return jsonResponse({
                    success: false,
                    error: isTimeout
                        ? "Telegram API request timed out"
                        : "Failed to connect to Telegram API"
                }, isTimeout ? 504 : 502);

            } finally {
                clearTimeout(timeout);
            }
        }

        return jsonResponse({
            success: false,
            error: "Endpoint not found"
        }, 404);
    }
};
