const express = require('express');

const { getWeather, searchPlaces } = require('../../services/geo');

function createGeoRouter(options = {}) {
  const router = express.Router();
  router.get('/search', async (req, res) => {
    res.json({ items: await searchPlaces(req.query.q, options) });
  });
  router.get('/weather', async (req, res) => {
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    res.json(await getWeather(req.query.latitude, req.query.longitude, { ...options, refresh }));
  });
  return router;
}

module.exports = { createGeoRouter };
