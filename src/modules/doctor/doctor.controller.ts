import httpStatus from "http-status";
import type { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { DoctorService } from "./doctor.service";
import { ApplyAsDoctorValidationZodSchema } from "./doctor.validation";

const applyDoctor = catchAsync(async (req: Request, res: Response) => {
	const files = req.files as { [fieldname: string]: Express.Multer.File[] };
	const resume = files?.["resume"]?.[0] ?? null;
	const additionalFiles = files?.["additionalFiles"] || [];
	const zodValidationResult = ApplyAsDoctorValidationZodSchema.safeParse(
		JSON.parse(req.body.data),
	);
	if (!zodValidationResult.success) {
		throw new Error(zodValidationResult.error.issues[0]?.message);
	}

	const payload = zodValidationResult.data;

	console.log(resume, additionalFiles, payload);
	const result = await DoctorService.applyDoctor(
		payload,
		resume,
		additionalFiles,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Applied As Doctor Successfull",
		data: result,
	});
});

const verifyDoctorEmail = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;
	const result = await DoctorService.verifyDoctorEmail(payload);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Doctor Email Verified Successfully",
		data: result,
	});
});

export const DoctorController = {
	applyDoctor,
	verifyDoctorEmail
};
