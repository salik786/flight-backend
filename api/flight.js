// api/flight.js

const puppeteer = require('puppeteer-core');
const chromium = require('chrome-aws-lambda');

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
    const url = `https://www.sydneyairport.com.au/flights/?query=&flightType=arrival&terminalType=${terminalType}&date=${formattedDate}&sortColumn=scheduled_time&ascending=true&showAll=true`;

    const browser = await puppeteer.launch({
        executablePath: await chromium.executablePath,
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        headless: true
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    await page.waitForSelector('.flight-card');

    const flightData = await page.evaluate(() => {
        const flights = [];
        const flightCards = document.querySelectorAll('.flight-card');

        flightCards.forEach(card => {
            const scheduledTimeElement = card.querySelector('.middle-pane .times .latest-time div');
            const statusContainer = card.querySelector('.status-container');
            const statusElement = statusContainer ? statusContainer.querySelector('.status') : null;
            let status = 'on time';

            if (statusElement) {
                const statusText = statusElement.textContent.trim().toLowerCase();
                const hasRedClass = statusElement.classList.contains('red');
                if (statusText.includes('cancelled') || hasRedClass) {
                    status = 'cancelled';
                } else if (statusText.includes('delayed')) {
                    status = 'delayed';
                }
            }

            const airlineElement = card.querySelector('.airline-logo span.with-image');
            const scheduledTime = scheduledTimeElement ? scheduledTimeElement.textContent.trim() : '';
            const airline = airlineElement ? airlineElement.textContent.trim().toLowerCase() : '';

            flights.push({
                scheduledTime,
                status,
                airline,
                rawStatus: statusElement ? statusElement.textContent.trim() : 'Unknown'
            });
        });
        return flights;
    });

    await browser.close();
    return flightData;
};

// Function to parse the date query parameter and adjust the date accordingly
const getParsedDate = (dateParam) => {
    let dateToFetch = new Date(); // Default to today's date

    if (dateParam === 'yesterday') {
        dateToFetch.setDate(dateToFetch.getDate() - 1);
    } else if (dateParam === 'tomorrow') {
        dateToFetch.setDate(dateToFetch.getDate() + 1);
    } else if (dateParam === 'day_after_tomorrow') {
        dateToFetch.setDate(dateToFetch.getDate() + 2);
    }
    return dateToFetch;
};

// Function to count the flight statuses
const countFlightStatuses = (flightData) => {
    const flightStatuses = {
        on_time: flightData.filter(flight => flight.status === 'on time').length,
        cancelled: flightData.filter(flight => flight.status === 'cancelled').length,
        delayed: flightData.filter(flight => flight.status === 'delayed').length,
    };
    return flightStatuses;
};

// Function to count flights by hour and terminal
const countFlightsByHour = (flightData) => {
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
    return flightCountByHour;
};

// Function to get peak hours based on the flight count
const getPeakHours = (flightCountByHour) => {
    let maxFlights = 0;
    let minFlights = Infinity;
    let maxHour = 0;
    let minHour = 0;

    for (let hour = 0; hour < 24; hour++) {
        const count = flightCountByHour[hour]?.total || 0;

        if (count > maxFlights) {
            maxFlights = count;
            maxHour = hour;
        }

        if (count < minFlights && count > 0) {
            minFlights = count;
            minHour = hour;
        }
    }

    return {
        max_flights: `${maxHour}-${maxHour + 1}`,
        lowest_flights: `${minHour}-${minHour + 1}`,
    };
};

// Main function to handle the entire flight data logic
const getFlightData = async (dateParam, flightType) => {
    const dateToFetch = getParsedDate(dateParam);
    const flightData = await getFlightTimes(dateToFetch, flightType);

    const flightStatuses = countFlightStatuses(flightData);
    const flightCountByHour = countFlightsByHour(flightData);
    const peakHours = getPeakHours(flightCountByHour);

    const flightDataResponse = {
        airport: "Sydney Airport",
        date: formatDate(dateToFetch),
        flight_type: flightType,
        flight_count: flightCountByHour,
        flight_statuses: flightStatuses,
        peak_hours: peakHours,
    };

    return flightDataResponse;
};

// Export the functions
module.exports = { getFlightData };
