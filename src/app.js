import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import documentationRoutes from './routes/documentation.routes.js';
import routes from './routes/index.js';

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.use('/api', routes);
app.use('/documentation', documentationRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
