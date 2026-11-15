import httpStatus from "http-status";
import { NextFunction, Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { appointmentService } from "./appointment.service";

const bookAppointment = catchAsync(
	async (req: Request, res: Response, next: NextFunction) => {
		const result = await appointmentService.bookAppointment();
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "User profile fetched successfully",
			data: result,
		});
	},
);

export const appointmentController = {
	bookAppointment,
};
