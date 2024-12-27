const express = require('express');
const puppeteer = require('puppeteer');
const mongoose = require('mongoose');
const cors = require('cors');
const FlightData = require('./models/FlightData');

const app = express();
const PORT = 5000;

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/flightstats', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

app.use(cors());

async function scrapeFlightData() {
    const url = 'https://www.sydneyairport.com.au/flights/?query=&flightType=arrival&terminalType=domestic&date=2024-12-28&sortColumn=scheduled_time&ascending=true&showAll=true';

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.flight-card');

    const flightData = await page.evaluate(() => {
        const flights = [];
        const flightCards = document.querySelectorAll('.flight-card');

        flightCards.forEach(card => {
            const scheduledTimeElement = card.querySelector('.middle-pane .times .latest-time div');
            const statusElement = card.querySelector('.middle-pane .times .status-container .status');

            if (scheduledTimeElement) {
                const scheduledTime = scheduledTimeElement.textContent.trim();
                const status = statusElement ? statusElement.textContent.trim().toLowerCase() : 'on time';

                flights.push({ scheduledTime, status });
            }
        });

        return flights;
    });

    const flightCountByHour = {};
    let cancelledFlights = 0;
    let delayedFlights = 0;
    let onTimeFlights = 0;

    flightData.forEach(({ scheduledTime, status }) => {
        const [hour] = scheduledTime.split(':');
        const flightHour = parseInt(hour, 10);

        if (!isNaN(flightHour)) {
            flightCountByHour[flightHour] = (flightCountByHour[flightHour] || 0) + 1;
        }

        if (status.includes('cancelled')) {
            cancelledFlights++;
        } else if (status.includes('delayed')) {
            delayedFlights++;
        } else {
            onTimeFlights++;
        }
    });

    const flightCountJSON = {
        airport: "Sydney Airport",
        date: "2024-12-28",
        flight_count: {},
        flight_statuses: {
            on_time: onTimeFlights,
            cancelled: cancelledFlights,
            delayed: delayedFlights
        },
        peak_hours: {
            max_flights: null,
            lowest_flights: null
        }
    };

    let maxFlights = 0;
    let minFlights = Infinity;
    let maxHour = 0;
    let minHour = 0;

    for (let hour = 0; hour < 24; hour++) {
        const count = flightCountByHour[hour] || 0;
        flightCountJSON.flight_count[`${hour}-${hour + 1}`] = count;

        if (count > maxFlights) {
            maxFlights = count;
            maxHour = hour;
        }

        if (count < minFlights) {
            minFlights = count;
            minHour = hour;
        }
    }

    flightCountJSON.peak_hours.max_flights = `${maxHour}-${maxHour + 1}`;
    flightCountJSON.peak_hours.lowest_flights = `${minHour}-${minHour + 1}`;

    await browser.close();
    return flightCountJSON;
}

// API endpoint to fetch data and save to MongoDB
app.get('/api/scrape', async (req, res) => {
    try {
        const flightData = await scrapeFlightData();

        // Save to MongoDB
        const newFlightData = new FlightData(flightData);
        await newFlightData.save();

        res.json({ message: 'Data scraped and saved to database', data: flightData });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error fetching flight data');
    }
});

// API endpoint to get the latest data from MongoDB
app.get('/api/flights', async (req, res) => {
    try {
        const latestData = await FlightData.findOne().sort({ created_at: -1 });
        res.json(latestData);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error retrieving flight data');
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
