import httpStatus from "http-status";
import type { NextFunction, Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { appointmentService } from "./appointment.service";

const bookAppointment = catchAsync(
	async (req: Request, res: Response, next: NextFunction) => {
		const payload = req.body;
		const user = req.user!;
		const result = await appointmentService.bookAppointment(payload, user);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			// CHANGE 12: Updated copy-pasted message to reflect appointment booking
			message: "Appointment booked and bKash payment URL generated successfully",
			data: result,
		});
	},
);

const bookAppointmentCallback = catchAsync(
	async (req: Request, res: Response, next: NextFunction) => {
		const { redirectUrl } = await appointmentService.bookAppointmentCallback(
			req.query,
		);
		res.redirect(redirectUrl);
	},
);

export const appointmentController = {
	bookAppointment,
	bookAppointmentCallback,
};
