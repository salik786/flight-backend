const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const port = 5000;

// Utility function to format the date as `DD/MM/YYYY`
const formatDate = (date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${year}/${month}/${day}`;
};

// Function to get flight data
const getFlightTimes = async (date, flightType) => {
    const terminalType = flightType === 'domestic' ? 'domestic' : 'international';
    const formattedDate = formatDate(date);
    console.log("formatted date", formattedDate)
    const url = `https://www.sydneyairport.com.au/flights/?query=&flightType=arrival&terminalType=${terminalType}&date=${formattedDate}&sortColumn=scheduled_time&ascending=true&showAll=true`;

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    await page.waitForSelector('.flight-card');

    const flightData = await page.evaluate(() => {
        const flights = [];
        const flightCards = document.querySelectorAll('.flight-card');

        flightCards.forEach(card => {
            // Get scheduled time
            const scheduledTimeElement = card.querySelector('.middle-pane .times .latest-time div');

            // Get status - improved status detection
            const statusContainer = card.querySelector('.status-container');
            const statusElement = statusContainer ? statusContainer.querySelector('.status') : null;
            let status = 'on time'; // default status

            if (statusElement) {
                const statusText = statusElement.textContent.trim().toLowerCase();
                const hasRedClass = statusElement.classList.contains('red');

                // Check for cancelled flights
                if (statusText.includes('cancelled') || hasRedClass) {
                    status = 'cancelled';
                }
                // Check for delayed flights
                else if (statusText.includes('delayed') ||
                    statusElement.classList.contains('amber') ||
                    card.querySelector('.delayed-time-small')) {
                    status = 'delayed';
                }
            }

            // Get airline
            const airlineElement = card.querySelector('.airline-logo span.with-image');

            const scheduledTime = scheduledTimeElement ? scheduledTimeElement.textContent.trim() : '';
            const airline = airlineElement ? airlineElement.textContent.trim().toLowerCase() : '';

            flights.push({
                scheduledTime,
                status,
                airline,
                rawStatus: statusElement ? statusElement.textContent.trim() : 'Unknown' // for debugging
            });
        });
        return flights;
    });

    await browser.close();

    // Debug log to check status distribution
    const statusCount = flightData.reduce((acc, flight) => {
        acc[flight.status] = (acc[flight.status] || 0) + 1;
        return acc;
    }, {});
    console.log('Status distribution:', statusCount);

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
    console.log(dateToFetch)
    // Get flight data for the selected date and flight type (domestic/international)
    const flightData = await getFlightTimes(dateToFetch, flightType);

    // Process the flight data
    const flightStatuses = {
        on_time: flightData.filter(flight => flight.status === 'on time').length,
        cancelled: flightData.filter(flight => flight.status === 'cancelled').length,
        delayed: flightData.filter(flight => flight.status === 'delayed').length,
    };

    // Count flights by terminal and hour
    const flightCountByHour = {};
    flightData.forEach(flight => {
        const [hour] = flight.scheduledTime.split(':');
        const flightHour = parseInt(hour, 10);
        const isT3 = flight.airline.includes('qantas');

        if (!isNaN(flightHour)) {
            if (!flightCountByHour[flightHour]) {
                flightCountByHour[flightHour] = { T2: 0, T3: 0, total: 0 };
            }
            if (isT3) {
                flightCountByHour[flightHour].T3 += 1;
            } else {
                flightCountByHour[flightHour].T2 += 1;
            }
            flightCountByHour[flightHour].total += 1;
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
        flight_type: flightType, // Add flight type to the response
        flight_count: {},
        flight_statuses: flightStatuses,
        peak_hours: {
            max_flights: null,
            lowest_flights: null,
        },
    };

    // Format the flight counts and calculate peak hours
    for (let hour = 0; hour < 24; hour++) {
        const count = flightCountByHour[hour]?.total || 0;
        flightCountJSON.flight_count[`${hour}-${hour + 1}`] = flightCountByHour[hour] || { T2: 0, T3: 0, total: 0 };

        if (count > maxFlights) {
            maxFlights = count;
            maxHour = hour;
        }

        if (count < minFlights && count > 0) {
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
