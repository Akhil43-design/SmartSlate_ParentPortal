const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'smartslate_parent_teacher_secret_2026';

function generateToken(user) {
    return jwt.sign(
        {
            id: user.id,
            uid: user.uid || user.firebaseUid || (user.email === 'parent_ramesh@smartslate.test' ? 'parent_ramesh_01' : (user.role === 'parent' ? 'parent_ramesh_01' : 'user_' + user.id)),
            name: user.name,
            role: user.role,
            email: user.email,
            student_code: user.student_code || user.studentCode,
            parent_code: user.parent_code || user.parentCode || (user.id ? `PAR-${user.id}` : 'PAR-5008')
        },
        JWT_SECRET,
        { expiresIn: '30d' }
    );
}

function authenticateToken(req, res, next) {
    let token = null;

    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
    } else if (req.headers['x-access-token']) {
        token = req.headers['x-access-token'];
    } else if (req.query && req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired session. Please log in again.' });
        }
        req.user = user;
        next();
    });
}

module.exports = {
    JWT_SECRET,
    generateToken,
    authenticateToken
};
