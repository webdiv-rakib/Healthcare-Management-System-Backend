import httpStatus from 'http-status';
import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { DoctorService } from './doctor.service';

const applyDoctor = catchAsync(
    async (req: Request, res: Response) => {

        const files = req.files as { [fieldname: string]: Express.Multer.File[] };
        console.log({ files })
        const resume = files?.['resume'] ? files['resume'][0] : null;
        const additionalFiles = files?.['additionalFiles'] || [];

        const data = JSON.parse(req.body.data)
        console.log(resume, additionalFiles, data);
        const result = await DoctorService.applyDoctor();
        sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: "Applied As Doctor Successfull",
            data: {},
        });
    }
);

export const DoctorController = {
    applyDoctor
}