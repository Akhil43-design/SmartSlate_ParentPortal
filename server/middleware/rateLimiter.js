const attemptsMap = new Map();

function rateLimiter(options = { windowMs: 15 * 60 * 1000, max: 20 }) {
    const { windowMs, max } = options;

    return (req, res, next) => {
        const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
        const now = Date.now();

        if (!attemptsMap.has(ip)) {
            attemptsMap.set(ip, { count: 1, resetTime: now + windowMs });
            return next();
        }

        const record = attemptsMap.get(ip);

        if (now > record.resetTime) {
            record.count = 1;
            record.resetTime = now + windowMs;
            return next();
        }

        record.count += 1;

        if (record.count > max) {
            console.warn(`[RateLimiter] Rate limit exceeded for IP: ${ip} on ${req.originalUrl}`);
            return res.status(429).json({
                error: 'Too many requests. Please wait before trying again.'
            });
        }

        next();
    };
}

module.exports = { rateLimiter };
