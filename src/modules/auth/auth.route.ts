import { NextFunction, Request, Response, Router } from "express";
import { authController } from "./auth.controller";
import { auth } from "../../middlewares/auth";
import { Role } from "../../../generated/prisma/enums";
import { authValidation } from "./auth.validation";

const router = Router();

router.post(
	"/register",
	(req: Request, res: Response, next: NextFunction) => {
		try {
			// const payload = req.body ? req.body : {};
			const payload = req.body ?? {};
			const result =
				authValidation.PatientRegistrationZodSchema.safeParse(payload);

			if (!result.success) {
				console.log(result.error);
				console.log(result.error.issues);
				throw new Error(result.error.issues[0]?.message);
			}
			req.body = result.data;
			next();
		} catch (error) {
			next(error);
		}
	},
	authController.registerPatient,
);
router.post("/login", authController.loginUser);
router.get(
	"/me",
	auth(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.PATIENT),
	authController.getMe,
);
router.post("/refresh-token", authController.refreshToken);
router.post("/google-login", authController.googleLogin);

export const authRoutes = router;
