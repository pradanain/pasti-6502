import {
	Gender,
	LastEducation,
	Purpose,
	QueueStatus,
	QueueType,
} from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import prisma from "@/lib/prisma";
import { z } from "zod";

const visitorSubmissionSchema = z.object({
	name: z.string().min(2, "Nama lengkap minimal 2 karakter"),
	email: z.string().email("Format email tidak valid"),
	address: z
		.string()
		.min(5, "Alamat minimal 5 karakter")
		.max(200, "Alamat terlalu panjang"),
	phone: z
		.string()
		.min(10, "No. WhatsApp minimal 10 digit")
		.max(20, "No. WhatsApp maksimal 20 digit")
		.regex(/^[0-9+()\s-]+$/, "Gunakan format nomor yang valid"),
	age: z.preprocess(
		(value) => {
			if (value === "" || value === null || typeof value === "undefined") {
				return undefined;
			}
			const asNumber = Number(value);
			return Number.isNaN(asNumber) ? value : asNumber;
		},
		z
			.number()
			.int()
			.min(1, "Umur minimal 1 tahun")
			.max(120, "Umur tidak valid")
	),
	institution: z
		.string()
		.min(2, "Asal/Instansi minimal 2 karakter")
		.max(150),
	gender: z.nativeEnum(Gender, {
		required_error: "Jenis kelamin wajib dipilih",
	}),
	lastEducation: z.nativeEnum(LastEducation, {
		required_error: "Pendidikan terakhir wajib dipilih",
	}),
	occupation: z.enum(
		[
			"Guru/Dosen",
			"Karyawan BUMN",
			"Karyawan Swasta",
			"Pelajar/Mahasiswa",
			"PNS/PPPK",
			"TNI/Polri",
			"Wiraswasta",
			"Lainnya",
		],
		{ required_error: "Pekerjaan wajib dipilih" }
	),
	purpose: z.nativeEnum(Purpose, {
		required_error: "Keperluan wajib dipilih",
	}),
	serviceId: z.string().min(1, "Layanan harus dipilih"),
	tempUuid: z.string().min(1, "Link sementara tidak valid"),
	queueType: z.nativeEnum(QueueType, {
		required_error: "Tipe antrean wajib dipilih",
	}),
});

export async function POST(req: NextRequest) {
	try {
		const payload = await req.json();
		const parsed = visitorSubmissionSchema.safeParse(payload);

		if (!parsed.success) {
			return NextResponse.json(
				{
					error: "Data tidak valid",
					details: parsed.error.flatten().fieldErrors,
				},
				{ status: 400 }
			);
		}

		const {
			name,
			phone,
			institution,
			email,
			address,
			age,
			gender,
			lastEducation,
			occupation,
			purpose,
			serviceId,
			tempUuid,
			queueType,
		} = parsed.data;

		const sanitized = {
			name: name.trim(),
			phone: phone.trim(),
			institution: institution.trim(),
			email: email.trim(),
			address: address.trim(),
			age,
			gender,
			lastEducation,
			occupation: occupation.trim(),
			purpose,
			serviceId: serviceId.trim(),
			tempUuid: tempUuid.trim(),
			queueType,
		};

		const tempVisitorLink = await prisma.tempVisitorLink.findUnique({
			where: { uuid: sanitized.tempUuid },
		});

		if (!tempVisitorLink) {
			return NextResponse.json(
				{ error: "Invalid temporary link" },
				{ status: 400 }
			);
		}

		if (tempVisitorLink.used) {
			return NextResponse.json(
				{ error: "This form has already been submitted" },
				{ status: 400 }
			);
		}

		if (new Date() > tempVisitorLink.expiresAt) {
			return NextResponse.json({ error: "Link has expired" }, { status: 400 });
		}

		const queueDate = new Date();
		queueDate.setHours(0, 0, 0, 0);

		type QueueResult = {
			visitor: { name: string };
			queue: {
				queueNumber: number;
				createdAt: Date;
				queueType: QueueType;
				service: { name: string };
			};
		};

		let result: QueueResult | null = null;

		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				result = await prisma.$transaction(async (tx) => {
					const latestQueue = await tx.queue.findFirst({
						where: {
							queueDate,
							serviceId: sanitized.serviceId,
						},
						orderBy: {
							queueNumber: "desc",
						},
						select: { queueNumber: true },
					});

					const nextQueueNumber = latestQueue ? latestQueue.queueNumber + 1 : 1;

					const visitor = await tx.visitor.create({
						data: {
							name: sanitized.name,
							phone: sanitized.phone,
							institution: sanitized.institution,
							email: sanitized.email,
							address: sanitized.address,
							age: sanitized.age,
							gender: sanitized.gender,
							lastEducation: sanitized.lastEducation,
							occupation: sanitized.occupation,
							purpose: sanitized.purpose,
						},
					});

					const trackingLink = `${nanoid(10)}`;
					const queue = await tx.queue.create({
						data: {
							queueNumber: nextQueueNumber,
							queueDate,
							status: QueueStatus.WAITING,
							queueType:
								sanitized.queueType === "ONLINE"
									? QueueType.ONLINE
									: QueueType.OFFLINE,
							visitorId: visitor.id,
							serviceId: sanitized.serviceId,
							tempUuid: sanitized.tempUuid,
							trackingLink: trackingLink,
							filledSKD: false,
						},
						include: {
							service: true,
						},
					});

					await tx.tempVisitorLink.update({
						where: { uuid: sanitized.tempUuid },
						data: { used: true },
					});

					const formatQueueDate = (date: Date): string => {
						const day = date.getDate().toString().padStart(2, "0");
						const month = (date.getMonth() + 1).toString().padStart(2, "0");
						return `${day}${month}`;
					};

					await tx.notification.create({
						data: {
							type: "NEW_QUEUE",
							title: "Antrean Baru",
							message: `Antrean baru #${queue.queueNumber}-${formatQueueDate(
								new Date(queue.createdAt)
							)} (${queue.queueType === "ONLINE" ? "Online" : "Offline"}) dari ${visitor.name} untuk layanan ${queue.service.name}`,
							isRead: false,
						},
					});

					return { visitor, queue };
				});
				break;
			} catch (error) {
				if ((error as { code?: string }).code === "P2002" && attempt < 2) {
					continue;
				}
				throw error;
			}
		}

		if (!result) {
			return NextResponse.json(
				{ error: "Gagal menetapkan nomor antrean, coba lagi." },
				{ status: 409 }
			);
		}
		return NextResponse.json({
			success: true,
			message: "Queue created successfully",
			data: {
				queueNumber: result.queue.queueNumber,
				serviceName: result.queue.service.name,
				visitorName: result.visitor.name,
				createdAt: result.queue.createdAt,
				queueType: result.queue.queueType,
				redirectUrl: `/visitor-form/${sanitized.tempUuid}`,
			},
		});
	} catch (error) {
		if ((error as { code?: string }).code === "P2002") {
			return NextResponse.json(
				{ error: "Nomor antrean duplikat, silakan coba lagi." },
				{ status: 409 }
			);
		}
		console.error("Error submitting visitor form:", error);
		return NextResponse.json(
			{ error: "Failed to process visitor form" },
			{ status: 500 }
		);
	}
}
