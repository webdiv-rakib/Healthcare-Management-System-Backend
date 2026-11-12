import z from "zod";

const PatientRegistrationZodSchema = z.object({
	name: z
		.string("Not A String")
		.min(3, "Name must atleast 3 character long")
		.max(10),
	email: z.email(),
	password: z
		.string()
		.min(8, "Password must be 8 characters long")
		.max(32)
		.regex(/[A-Z]/, "Password must contain atlest 1 Uppercase Letter")
		.regex(/[a-z]/, "Password must contain atlest 1 Lowercase Letter")
		.regex(/[0-9]/, "Password must contain atlest 1 Number")
		.regex(/[^A-Za-z0-9]/, "Password must contain atlest 1 Special character"),
	patient: z
		.object({
			contactNumber: z.string().optional(),
		})
		.optional(),
});

export const authValidation = {
	PatientRegistrationZodSchema,
};
