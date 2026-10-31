const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");

const env = require("./config/env");
const {connectDB} = require("./config/db");
const {notFound, errorHandler} = require("./middleware/errorHandler");

const healthRoute = require("./routes/health");

const app = express ();

app.set("trust proxy", 1);
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json({limit: "12mb"}));
app.use(express.urlencoded({extended: true, limit: "12mb"}));
app.use(cookieParser());
if(!env.isProd) app.use(morgan("dev"));

app.use("/api/health", healthRoute);

app.use(notFound);
app.use(errorHandler);

async function start(){
  try{
    await connectDB();
    app.listen(env.port, () => {
      console.log(`Server listening on http://localhost:${env.port} (${env.nodeEnv})`);
    });
  }catch(err){
    console.error("Failed to start server!: ", err.message);
    process.exit(1);
  }
}

process.on("unhandledRejection", (reason) => {
  console.error("unhandled rejection:", reason);
});

start();

module.exports = app;