
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

async function handleSendPhoto(request, env) {
    // Authentication
    if (!isAuthorized(request, env)) {
        return jsonResponse({
            success: false,
            error: "Unauthorized"
        }, 401);
    }

    if (!env.TELEGRAM_BOT_TOKEN) {
        return jsonResponse({
            success: false,
            error: "Telegram bot token is not configured"
        }, 500);
    }

    let photo;
    let caption = "";
    let chatId;
    let parseMode;

    const contentType = request.headers.get("Content-Type") || "";

    try {
        if (contentType.includes("multipart/form-data")) {
            // Upload file
            const body = await request.formData();

            photo = body.get("photo");
            caption = body.get("caption") || "";
            chatId = body.get("chat_id");
            parseMode = body.get("parse_mode");

            if (
                !photo ||
                typeof photo !== "object" ||
                typeof photo.arrayBuffer !== "function"
            ) {
                return jsonResponse({
                    success: false,
                    error: "Photo file is required"
                }, 400);
            }

            if (photo.size > 10 * 1024 * 1024) {
                return jsonResponse({
                    success: false,
                    error: "Photo exceeds 10 MB limit"
                }, 400);
            }

        } else if (contentType.includes("application/json")) {
            // Image URL
            const body = await request.json();

            photo = body.photo_url;
            caption = body.caption || "";
            chatId = body.chat_id;
            parseMode = body.parse_mode;

            if (typeof photo !== "string" || !photo.trim()) {
                return jsonResponse({
                    success: false,
                    error: "photo_url is required"
                }, 400);
            }

            try {
                const imageUrl = new URL(photo);

                if (!["http:", "https:"].includes(imageUrl.protocol)) {
                    throw new Error("Invalid protocol");
                }
            } catch {
                return jsonResponse({
                    success: false,
                    error: "Invalid photo URL"
                }, 400);
            }

        } else {
            return jsonResponse({
                success: false,
                error: "Use multipart/form-data or application/json"
            }, 415);
        }

    } catch {
        return jsonResponse({
            success: false,
            error: "Invalid request body"
        }, 400);
    }

    chatId = chatId || env.DEFAULT_CHAT_ID;

    if (!chatId) {
        return jsonResponse({
            success: false,
            error: "Chat ID is not configured"
        }, 400);
    }

    if (typeof caption !== "string" || caption.length > 1024) {
        return jsonResponse({
            success: false,
            error: "Caption exceeds 1024 characters"
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

    // Prepare Telegram request
    const telegramForm = new FormData();

    telegramForm.append("chat_id", String(chatId));

    if (typeof photo === "string") {
        telegramForm.append("photo", photo);
    } else {
        telegramForm.append("photo", photo, photo.name || "photo.jpg");
    }

    if (caption) {
        telegramForm.append("caption", caption);
    }

    if (parseMode) {
        telegramForm.append("parse_mode", parseMode);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
        const telegramResponse = await fetch(
            `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`,
            {
                method: "POST",
                body: telegramForm,
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
            message: "Photo sent successfully",
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


async function handleSendDocument(request, env) {
    if (!isAuthorized(request, env)) {
        return jsonResponse({
            success: false,
            error: "Unauthorized"
        }, 401);
    }

    if (!env.TELEGRAM_BOT_TOKEN) {
        return jsonResponse({
            success: false,
            error: "Telegram bot token is not configured"
        }, 500);
    }

    const contentType = request.headers.get("Content-Type") || "";

    let document;
    let caption = "";
    let chatId;
    let parseMode;

    try {
        if (contentType.includes("multipart/form-data")) {
            const body = await request.formData();

            document = body.get("document");
            caption = body.get("caption") || "";
            chatId = body.get("chat_id");
            parseMode = body.get("parse_mode");

            if (
                !document ||
                typeof document.arrayBuffer !== "function"
            ) {
                return jsonResponse({
                    success: false,
                    error: "Document file is required"
                }, 400);
            }

            if (document.size > 45 * 1024 * 1024) {
                return jsonResponse({
                    success: false,
                    error: "Document exceeds 45 MB limit"
                }, 400);
            }

        } else if (contentType.includes("application/json")) {
            const body = await request.json();

            document = body.document_url;
            caption = body.caption || "";
            chatId = body.chat_id;
            parseMode = body.parse_mode;

            if (typeof document !== "string" || !document.trim()) {
                return jsonResponse({
                    success: false,
                    error: "document_url is required"
                }, 400);
            }

            try {
                const fileUrl = new URL(document);

                if (!["http:", "https:"].includes(fileUrl.protocol)) {
                    throw new Error("Invalid protocol");
                }
            } catch {
                return jsonResponse({
                    success: false,
                    error: "Invalid document URL"
                }, 400);
            }

        } else {
            return jsonResponse({
                success: false,
                error: "Use multipart/form-data or application/json"
            }, 415);
        }

    } catch {
        return jsonResponse({
            success: false,
            error: "Invalid request body"
        }, 400);
    }

    chatId = chatId || env.DEFAULT_CHAT_ID;

    if (!chatId) {
        return jsonResponse({
            success: false,
            error: "Chat ID is not configured"
        }, 400);
    }

    if (typeof caption !== "string" || caption.length > 1024) {
        return jsonResponse({
            success: false,
            error: "Caption exceeds 1024 characters"
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

    const telegramForm = new FormData();

    telegramForm.append("chat_id", String(chatId));

    if (typeof document === "string") {
        telegramForm.append("document", document);
    } else {
        telegramForm.append(
            "document",
            document,
            document.name || "document"
        );
    }

    if (caption) {
        telegramForm.append("caption", caption);
    }

    if (parseMode) {
        telegramForm.append("parse_mode", parseMode);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
        const telegramResponse = await fetch(
            `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`,
            {
                method: "POST",
                body: telegramForm,
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
            message: "Document sent successfully",
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

        // Send photo
        if (url.pathname === "/send_photo") {
            if (request.method !== "POST") {
                return jsonResponse({
                    success: false,
                    error: "Method not allowed"
                }, 405);
            }

            return handleSendPhoto(request, env);
        }

        // Send document
        if (url.pathname === "/send_document") {
            if (request.method !== "POST") {
                return jsonResponse({
                    success: false,
                    error: "Method not allowed"
                }, 405);
            }

            return handleSendDocument(request, env);
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
