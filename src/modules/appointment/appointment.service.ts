import config from "../../config"
import { getBkashIdToken } from "../../lib/bkash"

const bookAppointment = async () => {
    const bkashIdToken = await getBkashIdToken();
    console.log(bkashIdToken, "bkash id_token")
    if (!bkashIdToken) {
        throw new Error("No Bkash Access Token Found")
    }
    const bkashCreatePayment = await fetch(`${config.bkash_base_url}/tokenized-checkout/payment/create`, {
        method: "POST",
        headers: {
            "Content-type": "application/json",
            Accept: "application/json",
            Authorization: bkashIdToken,
            "X-App-Key": config.bkash_app_key,

        },
        body: JSON.stringify({
            // mode: "0011",
            payerReference: "TEST001ABC", // user email or phone number
            callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
            amount: "1200",
            currency: "BDT",
            intent: "sale",
            merchantInvoiceNumber: "test001", // unique appointment/invoice id
        })
    })
    const bkashCreatePaymentResult = await bkashCreatePayment.json();

    return bkashCreatePaymentResult
}

export const AppointmentService = {
    bookAppointment
}