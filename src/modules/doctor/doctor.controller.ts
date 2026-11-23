import httpStatus from 'http-status';
import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { DoctorService } from './doctor.service';

const applyDoctor = catchAsync(
    async (req: Request, res: Response) => {
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };
        const resume = files?.["resume"]?.[0] ?? null;
        const additionalFiles = files?.["additionalFiles"] || [];
        const data = JSON.parse(req.body.data)


        console.log(resume, additionalFiles, data);
        const result = await DoctorService.applyDoctor(data, resume, additionalFiles);
        sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: "Applied As Doctor Successfull",
            data: result,
        });
    }
);

export const DoctorController = {
    applyDoctor
}