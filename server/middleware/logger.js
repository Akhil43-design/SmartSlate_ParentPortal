function requestLogger(req, res, next) {
    const start = Date.now();
    const { method, originalUrl, ip } = req;

    res.on('finish', () => {
        const duration = Date.now() - start;
        const status = res.statusCode;
        console.log(`[${new Date().toISOString()}] ${method} ${originalUrl} ${status} - ${duration}ms [${ip}]`);
    });

    next();
}

function errorLogger(err, req, res, next) {
    console.error(`[${new Date().toISOString()}] ERROR on ${req.method} ${req.originalUrl}:`, err.stack || err.message || err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error'
    });
}

module.exports = {
    requestLogger,
    errorLogger
};
