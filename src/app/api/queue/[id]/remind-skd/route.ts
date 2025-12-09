import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth"; // Updated import path
import prisma from "@/lib/prisma"; // Import shared prisma instance

export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		// Get the current session to verify authentication
		const session = await getServerSession(authOptions);
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { id } = await params;
		const { message } = await req.json();

		// Validate queue ID
		if (!id) {
			return NextResponse.json({ error: "Missing queue ID" }, { status: 400 });
		}

		// Find the queue
		const queue = await prisma.queue.findUnique({
			where: { id },
			include: {
				visitor: {
					select: {
						name: true,
						phone: true,
					},
				},
				service: {
					select: {
						name: true,
					},
				},
			},
		});

		if (!queue) {
			return NextResponse.json({ error: "Queue not found" }, { status: 404 });
		}

		// Generate WhatsApp link with pre-filled message

		// Clean phone number (remove +62 or 0 prefix and ensure it starts with 62)
		let phoneNumber = queue.visitor.phone.replace(/\s+/g, "");
		if (phoneNumber.startsWith("+62")) {
			phoneNumber = phoneNumber.substring(1); // Remove the + sign
		} else if (phoneNumber.startsWith("0")) {
			phoneNumber = "62" + phoneNumber.substring(1);
		} else if (!phoneNumber.startsWith("62")) {
			phoneNumber = "62" + phoneNumber;
		}

		// Default reminder message
		const defaultMessage = `Halo ${queue.visitor.name}, mohon kesediaannya untuk mengisi Survei Kebutuhan Data (SKD) 2025 BPS Bulungan melalui link berikut: s.bps.go.id/skd2025_bpsbusel`;

		// Use provided message or default
		const reminderMessage = message || defaultMessage;

		// Create WhatsApp URL
		const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(
			reminderMessage
		)}`;

		// Log this reminder action
		await prisma.notification.create({
			data: {
				type: "REMINDER_SENT",
				title: "Pengingat SKD Terkirim",
				message: `Pengingat SKD telah dikirim kepada ${queue.visitor.name} untuk antrean #${queue.queueNumber}`,
				isRead: false,
				userId: session.user.id,
			},
		});

		return NextResponse.json({
			success: true,
			message: "WhatsApp reminder prepared",
			data: {
				whatsappUrl,
				visitorName: queue.visitor.name,
				phone: queue.visitor.phone,
			},
		});
	} catch (error) {
		console.error("Error preparing SKD reminder:", error);
		return NextResponse.json(
			{ error: "Failed to prepare SKD reminder" },
			{ status: 500 }
		);
	}
}
