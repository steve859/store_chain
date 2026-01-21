import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import routes from './routes';
import notFound from './middlewares/notFound';
import errorHandler from './middlewares/errorHandler';
import { setupSwagger } from './docs/swagger';

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

setupSwagger(app);

app.use('/api/v1', routes);

app.use(notFound);
app.use(errorHandler);

export default app;
