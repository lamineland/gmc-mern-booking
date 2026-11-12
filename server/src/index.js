import { app } from './app.js';
import { config } from './config.js';
import { connectDb } from './db.js';
import { startPaymentJobs } from './services/payments/index.js';

await connectDb();
startPaymentJobs();
app.listen(config.port, () => console.log(`API listening on http://localhost:${config.port}`));
