// Parsed values go to req.valid[source]: in Express 5, req.query is read-only.
export const validate = (schema, source = 'body') => (req, res, next) => {
  req.valid = { ...(req.valid || {}), [source]: schema.parse(req[source] ?? {}) };
  next();
};
