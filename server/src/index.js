import { app } from './app.js';
import { config } from './config.js';
import { connectDb } from './db.js';

await connectDb();
app.listen(config.port, () => console.log(`API listening on http://localhost:${config.port}`));
