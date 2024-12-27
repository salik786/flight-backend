const mongoose = require('mongoose');

const FlightDataSchema = new mongoose.Schema({
    airport: String,
    date: String,
    flight_count: Object,
    flight_statuses: {
        on_time: Number,
        cancelled: Number,
        delayed: Number
    },
    peak_hours: {
        max_flights: String,
        lowest_flights: String
    },
    created_at: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('FlightData', FlightDataSchema);
