import { Request, Response } from "express";
import db from "../database/connection";
import convertHourToMinutes from "../utils/convertHourToMinutes";

interface ScheduleItem {
  week_day: number;
  from: string;
  to: string;
}

export default class ClassesController {
  async index(request: Request, response: Response) {
    const filters = request.query;

    if (!filters.subject || !filters.week_day || !filters.time) {
      return response.status(400).json({
        erro: "Precisamos dos filtros para procurar aulas legais para você.",
      });
    }

    const subject = filters.subject as string;
    const week_day = filters.week_day as string;
    const time = filters.time as string;

    const timeInMinutes = convertHourToMinutes(time);

    const classes = await db("classes")
      .whereExists(function () {
        this.select("class_schedules.*")
          .from("class_schedules")
          .whereRaw("`class_schedules`.`class_id` = `classes`.`id`")
          .whereRaw("`class_schedules`.`week_day` = ??", [Number(week_day)])
          .whereRaw("`class_schedules`.`from` <= ??", [Number(timeInMinutes)])
          .whereRaw("`class_schedules`.`to` > ??", [Number(timeInMinutes)])
      })
      .where("classes.subject", "=", subject)
      .join("users", "classes.user_id", "=", "users.id")
      .select(["classes.*", "users.*"]);

    response.status(200).json(classes);
  }

  async create(request: Request, response: Response) {
    const {
      name,
      avatar,
      whatsapp,
      bio,
      subject,
      cost,
      schedule,
    } = request.body;

    // Transações permitem executar várias ações ao mesmo tempo
    // Permitindo o cancelamento das modificações em caso de falha
    const trx = await db.transaction();

    try {
      const insertedUsersIds = await trx("users").insert({
        name,
        avatar,
        whatsapp,
        bio,
      });

      const user_id = insertedUsersIds[0];

      const insertedClassesIds = await trx("classes").insert({
        subject,
        cost,
        user_id,
      });

      const class_id = insertedClassesIds[0];

      const classSchedule = schedule.map((scheduleItem: ScheduleItem) => {
        return {
          class_id,
          week_day: scheduleItem.week_day,
          from: convertHourToMinutes(scheduleItem.from),
          to: convertHourToMinutes(scheduleItem.to),
        };
      });

      await trx("class_schedules").insert(classSchedule);

      await trx.commit();

      return response.status(201).send();
    } catch (err) {
      // Desfaz eventuais alterações feitas no try
      trx.rollback();
      return response.status(400).json({
        error: "Tivemos um erro inesperado enquanto criávamos aulas :(",
      });
    }
  }
}
