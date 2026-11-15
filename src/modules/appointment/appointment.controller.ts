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

const bookAppointmentCallback = catchAsync(
	async (req: Request, res: Response, next: NextFunction) => {
		console.log(req.query);
		const { executedPaymentResult, redirectUrl } =
			await appointmentService.bookAppointmentCallback(req.query);

		console.log(executedPaymentResult, "callback controller");
		res.redirect(redirectUrl);
		// sendResponse(res, {
		// 	statusCode: httpStatus.OK,
		// 	success: true,
		// 	message: "User profile fetched successfully",
		// 	data: result,
		// });
	},
);

export const appointmentController = {
	bookAppointment,
	bookAppointmentCallback,
};
