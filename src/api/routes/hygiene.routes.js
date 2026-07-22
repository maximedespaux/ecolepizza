const express = require('express');
const {
    listEquipment, createEquipment, updateEquipment, deleteEquipment,
    listTasks, createTask, updateTask, deleteTask,
    listPresets, createPreset, updatePreset, deletePreset,
    listEntries, createEntry, updateEntry, deleteEntry,
    getSummary,
} = require('../controllers/hygiene.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');

const router = express.Router();

// Tableau de bord du hub.
router.get('/summary', authenticateToken, getSummary);

// Référentiel des points de contrôle (chambre froide, four, friteuse…).
router.get('/equipment', authenticateToken, listEquipment);
router.post('/equipment', authenticateToken, createEquipment);
router.patch('/equipment/:id', authenticateToken, updateEquipment);
router.delete('/equipment/:id', authenticateToken, deleteEquipment);

// Plan de nettoyage (le modèle des tâches récurrentes).
router.get('/cleaning-tasks', authenticateToken, listTasks);
router.post('/cleaning-tasks', authenticateToken, createTask);
router.patch('/cleaning-tasks/:id', authenticateToken, updateTask);
router.delete('/cleaning-tasks/:id', authenticateToken, deleteTask);

// Préréglages (fournisseurs / produits fréquents) — paramétrage anti-re-saisie.
router.get('/presets', authenticateToken, listPresets);
router.post('/presets', authenticateToken, createPreset);
router.patch('/presets/:id', authenticateToken, updatePreset);
router.delete('/presets/:id', authenticateToken, deletePreset);

// Journal universel (relevés, livraisons, tâches cochées, étiquettes, huiles, non-conf., biodéchets, équipements).
router.get('/entries', authenticateToken, listEntries);
router.post('/entries', authenticateToken, createEntry);
router.patch('/entries/:id', authenticateToken, updateEntry);
router.delete('/entries/:id', authenticateToken, deleteEntry);

module.exports = router;
