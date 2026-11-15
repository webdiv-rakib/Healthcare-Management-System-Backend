import { Router } from "express";
import { appointmentController } from "./appointment.controller";

const router = Router();

router.post("/book-appointment", appointmentController.bookAppointment);

// book appointment callback url
router.get("/book-appointment/payment/callback", () => {});

export const appointmentRoutes = router;
