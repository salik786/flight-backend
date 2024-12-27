// index.js

const express = require('express');
const cors = require('cors');
const { getFlightData } = require('./api/flight');  // Import the function from flight.js

const app = express();
const port = 5000;

// Middleware for CORS (Cross-Origin Resource Sharing)
app.use(cors());

// Default route
app.get('/api/', (req, res) => {
    res.send('Welcome to the Flight API!');
});

// Route to get flight data
app.get('/api/flights', async (req, res) => {
    const { date, flightType } = req.query;

    // Fetch the flight data from the flight.js logic
    try {
        const flightData = await getFlightData(date, flightType);
        res.json(flightData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching flight data' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
