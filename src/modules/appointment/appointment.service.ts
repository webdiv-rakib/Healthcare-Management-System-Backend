import { getBkashIdTOken } from "./../../lib/bkash";
import config from "../../config";

const bookAppointment = async () => {
	const bkashIdTOken = await getBkashIdTOken();
	if (!bkashIdTOken) {
		throw new Error("No Bkash Access Token Found");
	}
	const bkashCreatePaymentResponse = await fetch(
		`${config.bkash_base_url}/tokenized-checkout/payment/create`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: bkashIdTOken,
				"X-App-Key": config.bkash_app_key,
			},
			body: JSON.stringify({
				payerReference: "TEST001ABC", // user email or phn number
				callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`, //
				amount: "1200",
				currency: "BDT",
				intent: "sale",
				merchantInvoiceNumber: "test001", // apointment number
				subMerchantName: "Test",
				merchantAssociationInfo: "MI05MID54RF09123456789",
			}),
		},
	);

	const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();

	return bkashCreatePaymentResult;
};

const bookAppointmentCallback = async () => {
	return {
		success: true,
	};
};

export const appointmentService = {
	bookAppointment,
	bookAppointmentCallback,
};
