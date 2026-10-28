import { Router } from 'express';
import { fileURLToPath } from 'node:url';

const DOCS_DIR = fileURLToPath(new URL('../../docs/', import.meta.url));

const router = Router();

// Self-contained HTML page: guides, endpoint reference and a "Try it" console.
router.get('/', (req, res) => {
  res.sendFile('index.html', { root: DOCS_DIR });
});

// Machine-readable spec, e.g. for importing into Postman.
router.get('/openapi.yaml', (req, res) => {
  res.type('text/yaml').sendFile('openapi.yaml', { root: DOCS_DIR });
});

export default router;
