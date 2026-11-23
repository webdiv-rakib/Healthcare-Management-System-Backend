import httpStatus from "http-status";
import cookieParser from "cookie-parser";
import express, {
	type NextFunction,
	type Application,
	type Request,
	type Response,
} from "express";
import cors from "cors";
import config from "./config";
import { globalErrorHandler } from "./middlewares/globalErrorHandler";
import { notFound } from "./middlewares/notFound";
import { authRoutes } from "./modules/auth/auth.route";
import { userRoutes } from "./modules/user/user.route";
import { getBkashIdToken } from "./lib/bkash";
import { AppointmentRoute } from "./modules/appointment/appointment.route";
import { DoctorRoute } from "./modules/doctor/doctor.route";

const app: Application = express();
// middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
	cors({
		origin: config.frontend_url,
		credentials: true,
	}),
);
app.get("/", (req: Request, res: Response) => {
	res.status(httpStatus.OK).json({
		success: true,
		message: "Welcome to Healthcare Management System",
	});
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/user", userRoutes);
app.use("/api/v1/appointment", AppointmentRoute);
app.use("/api/v1/doctors", DoctorRoute);

app.get("/test", async (req: Request, res: Response, next: NextFunction) => {
	try {
		const grandIdTokenResult = await getBkashIdToken();
		console.log(grandIdTokenResult, "Grand ID Token");
		res.status(httpStatus.OK).json({
			success: true,
			message: "Welcome to Healthcare Management System",
			data: null,
		});
	} catch (error) {
		console.log(error);
		next(error);
	}
});

app.use(globalErrorHandler);
app.use(notFound);

export default app;
