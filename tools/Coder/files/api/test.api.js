// api/test.api.js

/**
 * Handles requests for the /api/test.api.js endpoint.
 * This function will be dynamically loaded and called by the server.
 *
 * @param {http.ServerRequest} req - The HTTP request object.
 * @param {http.ServerResponse} res - The HTTP response object.
 */
exports.handler = async (req, res) => {
    switch (req.method) {
        case 'GET':
            	// Handle GET requests
            sendJsonResponse(res, {
                message: 'Welcome to the test API!',
                timestamp: new Date().toISOString(),
                method: req.method
            });
            break;

        case 'POST':
            // Handle POST requests
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString(); // convert Buffer to string
            });
            req.on('end', () => {
                try {
                    const postData = JSON.parse(body);
                    sendJsonResponse(res, {
                        message: 'Received your POST data!',
                        yourData: postData,
                        method: req.method
                    });
                } catch (e) {
                    sendPlainTextResponse(res, '400 Bad Request: Invalid JSON', 400);
                }
            });
            break;

        case 'PUT':
            // Example for PUT: just a placeholder
            sendPlainTextResponse(res, 'PUT request received for test API.', 200);
            break;

        case 'DELETE':
            // Example for DELETE: just a placeholder
            sendPlainTextResponse(res, 'DELETE request received for test API.', 200);
            break;

        default:
            // Handle any other HTTP methods
            sendPlainTextResponse(res, `Method Not Allowed: ${req.method}`, 405, { 'Allow': 'GET, POST, PUT, DELETE' });
            break;
    }
};
