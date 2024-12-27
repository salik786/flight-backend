const puppeteer = require('puppeteer');

async function getFlightTimes() {
    const url = 'https://www.sydneyairport.com.au/flights/?query=&flightType=arrival&terminalType=domestic&date=2024-12-27&sortColumn=scheduled_time&ascending=true&showAll=true'; // Replace with your URL

    // Launch a headless browser
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // Go to the URL and wait for the dynamic content to load
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Wait for the flight cards to load
    await page.waitForSelector('.flight-card');

    // Extract flight data
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

    console.log("Extracted flight data: ", flightData); // Debugging output

    // Process the times and count flights per hour
    const flightCountByHour = {};
    let cancelledFlights = 0;
    let delayedFlights = 0;
    let onTimeFlights = 0;

    flightData.forEach(({ scheduledTime, status }) => {
        const [hour, minute] = scheduledTime.split(':');
        const flightHour = parseInt(hour, 10);

        if (!isNaN(flightHour)) {
            if (flightCountByHour[flightHour]) {
                flightCountByHour[flightHour]++;
            } else {
                flightCountByHour[flightHour] = 1;
            }
        }

        // Count flight statuses
        if (status.includes('cancelled')) {
            cancelledFlights++;
        } else if (status.includes('delayed')) {
            delayedFlights++;
        } else {
            onTimeFlights++;
        }
    });

    // Prepare JSON data
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

    // Output the final JSON
    console.log("Flight Count JSON: ", JSON.stringify(flightCountJSON, null, 2));

    // Close the browser
    await browser.close();
}

getFlightTimes();
