const express = require('express');
const { requireAuth } = require('../middleware/auth');
const geoWeather = require('../services/geoWeather');

const router = express.Router();

router.get('/geo/search', requireAuth, async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (query.length < 2) return res.json({ results: [] });
  try {
    const results = await geoWeather.searchPlaces(query);
    res.json({ results: results });
  } catch (error) {
    console.error('[geo/search]', error && error.message);
    res.status(502).json({ error: 'Не удалось получить данные геокодинга', results: [] });
  }
});

router.get('/weather', requireAuth, async (req, res) => {
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ error: 'Нужны координаты lat и lon' });
  }
  try {
    res.json(await geoWeather.getWeather(latitude, longitude));
  } catch (error) {
    console.error('[weather]', error && error.message);
    res.status(502).json({ error: 'Не удалось получить погоду' });
  }
});

module.exports = router;
