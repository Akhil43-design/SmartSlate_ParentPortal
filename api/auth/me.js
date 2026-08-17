const authRoutes = require('../../server/routes/auth');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/', authRoutes);

module.exports = (req, res) => {
    return app(req, res);
};
