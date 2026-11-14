import httpStatus from "http-status";
import { NextFunction, Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { userService } from "./user.service";

const uploadProfileImage = catchAsync(
	async (req: Request, res: Response, next: NextFunction) => {
		if (!req.file) {
			throw new Error("No file uploaded");
		}

		const userId = req.user?.userId as string;

		console.log(req.file, "req.file");
		await userService.uploadProfileImage(req.file?.buffer, userId);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "New tokens generated successfully",
			data: null,
		});
	},
);

export const userController = {
	uploadProfileImage,
};
