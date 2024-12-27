const cron = require('node-cron');

// Schedule the scrape job to run every hour
cron.schedule('0 * * * *', async () => {
    console.log('Running hourly scrape job...');
    await scrapeFlightData();
});
