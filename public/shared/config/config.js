/* SmartSlate Central Configuration */

const config = {
    // Development Student URL: http://localhost:3000
    // Production Student URL: http://10.42.0.1:3000
    SMARTSLATE_STUDENT_URL: process.env.SMARTSLATE_STUDENT_URL || "http://localhost:3000",
    PORT: process.env.PORT || 3000,
    PORTAL_PORT: process.env.PORTAL_PORT || 3001
};

module.exports = config;
