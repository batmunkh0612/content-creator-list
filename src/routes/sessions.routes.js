'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/sessions.controller');
const asyncHandler = require('../utils/asyncHandler');
const requireAuth = require('../middleware/auth.middleware');

const router = Router();

router.get('/',           requireAuth, asyncHandler(ctrl.listSessions));
router.post('/',          requireAuth, asyncHandler(ctrl.createSession));
router.post('/reload',    requireAuth, asyncHandler(ctrl.reloadSessions));
router.patch('/:id',      requireAuth, asyncHandler(ctrl.updateSession));
router.delete('/:id',     requireAuth, asyncHandler(ctrl.deleteSession));

module.exports = router;
