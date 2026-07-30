import { Request, Response } from "express";
import * as usersService from "./users.service.js";
import { handleUsersError } from "../../shared/utils/error.js";

export async function listByRole(req: Request, res: Response): Promise<void> {
  try {
    const role = String(req.params.role);
    const result = await usersService.listActiveUsersByRole(role);
    res.json(result);
  } catch (error) {
    handleUsersError(res, error);
  }
}

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const { search, role, active, firstLogin, page, pageSize } = req.query;
    const result = await usersService.listUsers({
      search: search as string | undefined,
      role: role as string | undefined,
      active: active !== undefined ? active === "true" : undefined,
      firstLogin: firstLogin !== undefined ? firstLogin === "true" : undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
    res.json(result);
  } catch (error) {
    handleUsersError(res, error);
  }
}

export async function get(req: Request, res: Response): Promise<void> {
  try {
    const user = await usersService.getUser(Number(req.params.id));
    res.json(user);
  } catch (error) {
    handleUsersError(res, error);
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const { employeeCode, fullName, email, roles } = req.body ?? {};
    if (!employeeCode || !fullName || !email || !Array.isArray(roles) || roles.length === 0) {
      res.status(400).json({ message: "employeeCode, fullName, email et roles (non vide) sont requis." });
      return;
    }

    const result = await usersService.createUser({
      employeeCode,
      fullName,
      email,
      roles,
      createdByUserId: req.user!.userId,
    });
    res.status(201).json(result);
  } catch (error) {
    handleUsersError(res, error);
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const { email, active, roles } = req.body ?? {};
    const user = await usersService.updateUser(Number(req.params.id), {
      email,
      active,
      roles,
      updatedByUserId: req.user!.userId,
    });
    res.json(user);
  } catch (error) {
    handleUsersError(res, error);
  }
}

export async function summary(_req: Request, res: Response): Promise<void> {
  try {
    const result = await usersService.getUsersSummary();
    res.json(result);
  } catch (error) {
    handleUsersError(res, error);
  }
}

export async function updateRoles(req: Request, res: Response): Promise<void> {
  try {
    const { roles } = req.body ?? {};
    if (!Array.isArray(roles) || roles.length === 0) {
      res.status(400).json({ message: "roles (non vide) est requis." });
      return;
    }

    const user = await usersService.updateUserRoles(Number(req.params.id), {
      roles,
      updatedByUserId: req.user!.userId,
      actorRoles: req.user!.roles,
    });
    res.json(user);
  } catch (error) {
    handleUsersError(res, error);
  }
}

export async function toggleActivation(req: Request, res: Response): Promise<void> {
  try {
    const { active } = req.body ?? {};
    const user = await usersService.toggleActivation(
      Number(req.params.id),
      Boolean(active),
      req.user!.userId
    );
    res.json(user);
  } catch (error) {
    handleUsersError(res, error);
  }
}

export async function resetOTP(req: Request, res: Response): Promise<void> {
  try {
    const result = await usersService.resetOTP(Number(req.params.id), req.user!.userId);
    res.json(result);
  } catch (error) {
    handleUsersError(res, error);
  }
}
