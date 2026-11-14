import httpStatus from "http-status";
import { NextFunction, Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";

const uploadProfileImage = catchAsync(
	async (req: Request, res: Response, next: NextFunction) => {
		console.log(req.file, "req.file");
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
