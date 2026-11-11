import httpStatus from "http-status";
import type { NextFunction, Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { authService } from "./auth.service";
import { sendResponse } from "../../utils/sendResponse";
import type { IRequestUser } from "./auth.interface";

const registerPatient = catchAsync(
	async (req: Request, res: Response, next: NextFunction) => {
		const payload = req.body;
		const result = await authService.registerPatient(payload);
		const { accessToken, refreshToken, user, patient } = result;

		res.cookie("accessToken", accessToken, {
			httpOnly: true,
			secure: false,
			sameSite: "lax",
			maxAge: 1000 * 60 * 60 * 24,
		});
		res.cookie("refreshToken", refreshToken, {
			httpOnly: true,
			secure: false,
			sameSite: "lax",
			maxAge: 1000 * 60 * 60 * 24 * 7,
		});

		sendResponse(res, {
			statusCode: httpStatus.CREATED,
			success: true,
			message: "Patient register successfully",
			data: {
				accessToken,
				refreshToken,
				user,
				patient,
			},
		});
	},
);

const loginUser = catchAsync(
	async (req: Request, res: Response, next: NextFunction) => {
		const payload = req.body;
		const result = await authService.loginUser(payload);
		const { accessToken, refreshToken } = result;

		res.cookie("accessToken", accessToken, {
			httpOnly: true,
			secure: false,
			sameSite: "none",
			maxAge: 1000 * 60 * 60 * 24, // 24 hour or 1 day
		});
		res.cookie("refreshToken", refreshToken, {
			httpOnly: true,
			secure: false,
			sameSite: "none",
			maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
		});
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "User logged in successfully",
			data: {
				accessToken,
				refreshToken,
			},
		});
	},
);

const getMe = catchAsync(
	async (req: Request, res: Response, next: NextFunction) => {
		const user = req.user as unknown as IRequestUser;

		if (!user) {
			throw new Error("User information is missing in the request");
		}

		const result = await authService.getMe(user);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "User profile fetched successfully",
			data: result,
		});
	},
);

const refreshToken = catchAsync(
	async (req: Request, res: Response, next: NextFunction) => {
		if (!req.cookies.refreshToken) {
			throw new Error("Refresh token is missing");
		}
		const result = await authService.refreshToken(req.cookies.refreshToken);
		const { accessToken, refreshToken: newRefreshToken } = result;

		res.cookie("accessToken", accessToken, {
			httpOnly: true,
			secure: false,
			sameSite: "none",
			maxAge: 1000 * 60 * 60 * 24, // 24 hour or 1 day
		});
		res.cookie("refreshToken", newRefreshToken, {
			httpOnly: true,
			secure: false,
			sameSite: "none",
			maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
		});

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "New tokens generated successfully",
			data: {
				accessToken,
				refreshToken: newRefreshToken,
			},
		});
	},
);

export const authController = {
	registerPatient,
	loginUser,
	getMe,
	refreshToken,
};
