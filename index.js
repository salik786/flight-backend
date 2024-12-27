const express = require('express');
const cors = require('cors');
const { getFlightData } = require('./api/flight');

const app = express();
app.use(cors());

app.get('/api', (req, res) => {
    res.send('Welcome to the Flight API!');
});

app.get('/api/flights', async (req, res) => {
    const { date, flightType } = req.query;
    try {
        const flightData = await getFlightData(date, flightType);
        res.json(flightData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching flight data' });
    }
});

// Remove app.listen() for Vercel deployment
module.exports = app;