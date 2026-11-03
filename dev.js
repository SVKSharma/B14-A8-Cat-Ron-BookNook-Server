import "dotenv/config";

import app from "./index.js";

const port = process.env.PORT;
if (!port) throw new Error("PORT must be configured in the backend environment.");

app.listen(port, () => {
  console.log(`Server is running at ${port}`);
});
