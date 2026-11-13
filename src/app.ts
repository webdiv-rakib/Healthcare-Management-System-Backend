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
import z, { success } from "zod";
import { redisClient } from "./lib/redis";

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
// app.use("/zod", async (req: Request, res: Response, next: NextFunction) => {
// 	try {
// 		const UserZodSchema = z.object({
// 			name: z.string().min(50),
// 			email: z.email(),
// 			age: z.number().optional(),
// 			isVerified: z.boolean().optional(),
// 			books: z.array(z.string()).optional(),
// 		});
// 		const payload = req.body;
// 		const result = UserZodSchema.safeParse(payload);
// 		console.log(result);
// 		if (!result.success) {
// 			console.log(result.error);
// 		}
// 		if (result.success) {
// 			console.log(result.data);
// 		}
// 		res.status(httpStatus.OK).json({
// 			success: true,
// 			message: "Welcome to Healthcare Management System",
// 			data: result,
// 		});
// 	} catch (error) {
// 		console.log(error);
// 		next(error);
// 	}
// });
app.get("/test", async (req: Request, res: Response, next: NextFunction) => {
	try {
		await redisClient.set("forgot-password-otp:patient1@gmail.com", "123456", {
			expiration: {
				type: "EX",
				value: 60,
			},
		});

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
