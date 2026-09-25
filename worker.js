// Child process that owns the highlighter. The extension starts it with
// --liftoff-only. V8's optimizing compiler spends hundreds of MB on large
// grammar lexers such as bash's, and V8 flags apply to a whole process, so
// the flag lives here rather than in the shared extension host.
const { createHighlighter, encode } = require('./highlight');

const highlighter = createHighlighter();

process.on('message', async ({ id, type, text }) => {
  try {
    const h = await highlighter;
    if (type === 'legend') process.send({ id, legend: h.legend });
    else process.send({ id, data: encode(await h.tokens(text)) });
  } catch (err) {
    process.send({ id, error: String(err && err.stack ? err.stack : err) });
  }
});
