import { Router, Request, Response } from 'express';
import { db } from './db';

const router = Router();

// 1. Node Registration
router.post('/register', async (req: Request, res: Response) => {
    const { node_id, facility_name, country_code, city, timezone, contact_email } = req.body;

    if (!node_id || !facility_name || !country_code) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        await db.execute(
            `INSERT INTO printer_nodes (node_id, facility_name, country_code, city, timezone, contact_email, status)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
       ON DUPLICATE KEY UPDATE facility_name = ?, country_code = ?, city = ?, timezone = ?, contact_email = ?`,
            [node_id, facility_name, country_code, city, timezone, contact_email, facility_name, country_code, city, timezone, contact_email]
        );

        res.status(201).json({ status: 'REGISTERED', node_id });
    } catch (err: any) {
        console.error('Registration failed:', err);
        res.status(500).json({ error: 'Failed to register node', details: err.message });
    }
});

// 2. Capability Exposure
router.put('/:node_id/capabilities', async (req: Request, res: Response) => {
    const { node_id } = req.params;
    const capabilities = req.body;

    if (!capabilities || Object.keys(capabilities).length === 0) {
        return res.status(400).json({ error: 'Capabilities descriptor missing' });
    }

    try {
        // We store the hash/blob of capabilities for matchmaking optimization
        await db.execute(
            `UPDATE printer_nodes 
       SET capabilities_hash = ?, updated_at = NOW() 
       WHERE node_id = ?`,
            [JSON.stringify(capabilities), node_id]
        );

        res.json({ status: 'UPDATED', node_id });
    } catch (err: any) {
        console.error('Capability update failed:', err);
        res.status(500).json({ error: 'Failed to update capabilities' });
    }
});

export default router;
