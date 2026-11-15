import { Router } from "express";
import { appointmentController } from "./appointment.controller";
import { auth } from "../../middlewares/auth";
import { Role } from "../../../generated/prisma/enums";

const router = Router();

router.post(
	"/book-appointment",
	auth(Role.PATIENT),
	appointmentController.bookAppointment,
);

// book appointment callback url
router.get(
	"/book-appointment/payment/callback",
	appointmentController.bookAppointmentCallback,
);

export const appointmentRoutes = router;
