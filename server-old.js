const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const port = 5000;

// Utility function to format the date as `DD/MM/YYYY`
const formatDate = (date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
};

// Function to get flight data
const getFlightTimes = async (date, flightType) => {
    const terminalType = flightType === 'domestic' ? 'domestic' : 'international';
    const formattedDate = formatDate(date);
    const url = `https://www.sydneyairport.com.au/flights/?query=&flightType=arrival&terminalType=${terminalType}&date=${formattedDate}&sortColumn=scheduled_time&ascending=true&showAll=true`;

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    await page.waitForSelector('.flight-card');

    const flightData = await page.evaluate(() => {
        const flights = [];
        const flightCards = document.querySelectorAll('.flight-card');
        flightCards.forEach(card => {
            const scheduledTimeElement = card.querySelector('.middle-pane .times .latest-time div');
            const statusElement = card.querySelector('.status-container .status');
            const scheduledTime = scheduledTimeElement ? scheduledTimeElement.textContent.trim() : '';
            const status = statusElement ? statusElement.textContent.trim() : 'On Time';

            flights.push({ scheduledTime, status });
        });
        return flights;
    });

    await browser.close();

    return flightData;
};

// Endpoint to get flight data based on selected filters
app.get('/api/flights', async (req, res) => {
    const { date, flightType } = req.query;

    let dateToFetch = new Date(); // Default is today's date

    // Parse the date filter
    if (date === 'yesterday') {
        dateToFetch.setDate(dateToFetch.getDate() - 1);
    } else if (date === 'tomorrow') {
        dateToFetch.setDate(dateToFetch.getDate() + 1);
    } else if (date === 'day_after_tomorrow') {
        dateToFetch.setDate(dateToFetch.getDate() + 2);
    }

    // Get flight data for the selected date and flight type (domestic/international)
    const flightData = await getFlightTimes(dateToFetch, flightType);

    // Process the flight data (Count on-time, delayed, cancelled flights)
    const flightStatuses = {
        on_time: flightData.filter(flight => flight.status === 'On Time').length,
        cancelled: flightData.filter(flight => flight.status === 'Cancelled').length,
        delayed: flightData.filter(flight => flight.status === 'Delayed').length,
    };

    // Count flights per hour
    const flightCountByHour = {};
    flightData.forEach(flight => {
        const [hour] = flight.scheduledTime.split(':');
        const flightHour = parseInt(hour, 10);

        if (!isNaN(flightHour)) {
            flightCountByHour[flightHour] = (flightCountByHour[flightHour] || 0) + 1;
        }
    });

    // Calculate peak hours (max and min flights)
    let maxFlights = 0;
    let minFlights = Infinity;
    let maxHour = 0;
    let minHour = 0;

    const flightCountJSON = {
        airport: "Sydney Airport",
        date: formatDate(dateToFetch),
        flight_count: {},
        flight_statuses: flightStatuses,
        peak_hours: {
            max_flights: null,
            lowest_flights: null
        }
    };

    // Format the flight counts and calculate peak hours
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

    // Set peak hours
    flightCountJSON.peak_hours.max_flights = `${maxHour}-${maxHour + 1}`;
    flightCountJSON.peak_hours.lowest_flights = `${minHour}-${minHour + 1}`;

    // Send the final response with the structured data
    res.json(flightCountJSON);
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
