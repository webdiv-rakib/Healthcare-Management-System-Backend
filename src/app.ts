import cookieParser from "cookie-parser";
import express, { Application, Request, Response } from "express";
import cors from 'cors'
import config from "./config";

const app: Application = express();

// middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors({
    origin: config.frontend_url,
    credentials: true
}))
app.get('/', (req: Request, res: Response) => {
    res.send("Healthcare management system")
})

export default app;