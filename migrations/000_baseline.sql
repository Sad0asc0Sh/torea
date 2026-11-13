--
-- BASELINE MIGRATION (auto-generated from a live bria_db schema dump)
--
-- Source of truth: current production/staging database schema at generation time.
--
-- How to use:
--   - New empty database: run via `npm run db:migrate` (recommended)
--   - Existing database: DO NOT run this file; instead run `npm run db:migrate -- --mark-applied`
--
-- Notes:
--   - This file may require privileges to create extensions (pgcrypto).
--     If you hit permission errors, enable extensions as a superuser first.
--
--
-- PostgreSQL database dump
--


-- Dumped from database version 14.20 (Ubuntu 14.20-0ubuntu0.22.04.1)
-- Dumped by pg_dump version 14.20 (Ubuntu 14.20-0ubuntu0.22.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: bria_after_edges_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bria_after_edges_sync() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM public.bria_sync_org_nodes_levels();
  RETURN NULL;
END;
$$;


--
-- Name: bria_org_nodes_to_edges(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bria_org_nodes_to_edges() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- if parent_id is null => remove edge
  IF NEW.parent_id IS NULL THEN
    DELETE FROM public.org_node_edges WHERE child_id = NEW.id;
  ELSE
    INSERT INTO public.org_node_edges(child_id, parent_id)
    VALUES (NEW.id, NEW.parent_id)
    ON CONFLICT (child_id) DO UPDATE SET parent_id = EXCLUDED.parent_id;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: bria_prevent_org_cycle(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bria_prevent_org_cycle() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  hit int;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id = NEW.child_id THEN
    RAISE EXCEPTION 'Invalid hierarchy: node cannot be parent of itself';
  END IF;

  -- Check if NEW.parent_id is in descendants of NEW.child_id (would create a cycle)
  WITH RECURSIVE sub AS (
    SELECT child_id
    FROM public.org_node_edges
    WHERE parent_id = NEW.child_id
    UNION ALL
    SELECT e.child_id
    FROM public.org_node_edges e
    JOIN sub s ON e.parent_id = s.child_id
  )
  SELECT 1 INTO hit FROM sub WHERE child_id = NEW.parent_id LIMIT 1;

  IF hit = 1 THEN
    RAISE EXCEPTION 'Invalid hierarchy: cycle detected (this parent creates a loop)';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: bria_sync_org_nodes_levels(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bria_sync_org_nodes_levels() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- اگر هیچ edge ای نداریم، چیزی برای sync نیست
  IF NOT EXISTS (SELECT 1 FROM public.org_node_edges LIMIT 1) THEN
    RETURN;
  END IF;

  WITH RECURSIVE
  roots AS (
    SELECT n.id
    FROM public.org_nodes n
    LEFT JOIN public.org_node_edges e ON e.child_id = n.id
    WHERE e.child_id IS NULL
  ),
  tree AS (
    SELECT r.id, 1 AS lvl
    FROM roots r
    UNION ALL
    SELECT e.child_id, t.lvl + 1
    FROM public.org_node_edges e
    JOIN tree t ON e.parent_id = t.id
  )
  UPDATE public.org_nodes n
  SET level = t.lvl
  FROM tree t
  WHERE n.id = t.id;

END;
$$;


--
-- Name: propagate_team_to_descendants(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.propagate_team_to_descendants(p_manager uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_team_id bigint;
BEGIN
  SELECT team_id INTO v_team_id
  FROM user_team_assignment
  WHERE user_id = p_manager;

  IF v_team_id IS NULL THEN
    RETURN;
  END IF;

  WITH RECURSIVE subtree AS (
    SELECT id
    FROM users
    WHERE id = p_manager
    UNION ALL
    SELECT u.id
    FROM users u
    JOIN subtree s ON u.manager_id = s.id
  )
  INSERT INTO user_team_assignment(user_id, team_id)
  SELECT s.id, v_team_id
  FROM subtree s
  WHERE s.id <> p_manager
  ON CONFLICT (user_id) DO UPDATE
    SET team_id = EXCLUDED.team_id,
        updated_at = now();
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;


--
-- Name: trg_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: trg_user_team_assignment_propagate_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_user_team_assignment_propagate_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- deactivate old memberships for this user in other teams
  UPDATE public.team_users
     SET active = false, updated_at = now()
   WHERE user_id = NEW.user_id
     AND role = 'member'
     AND team_id <> NEW.team_id;

  UPDATE public.team_members
     SET active = false, updated_at = now()
   WHERE user_id = NEW.user_id
     AND team_id <> NEW.team_id;

  -- upsert membership in team_users as member
  INSERT INTO public.team_users (team_id, user_id, role, active)
  VALUES (NEW.team_id, NEW.user_id, 'member', true)
  ON CONFLICT (team_id, user_id, role)
  DO UPDATE SET active = EXCLUDED.active, updated_at = now();

  -- upsert membership in team_members as member
  INSERT INTO public.team_members (team_id, user_id, role, active)
  VALUES (NEW.team_id, NEW.user_id, 'member', true)
  ON CONFLICT (team_id, user_id)
  DO UPDATE SET active = EXCLUDED.active, role = 'member', updated_at = now();

  RETURN NEW;
END;
$$;


--
-- Name: update_automation_ai_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_automation_ai_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_sessions (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp with time zone NOT NULL
);


--
-- Name: admin_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_settings (
    id integer NOT NULL,
    subject character varying NOT NULL,
    key character varying NOT NULL,
    value text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: admin_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.admin_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: admin_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.admin_settings_id_seq OWNED BY public.admin_settings.id;


--
-- Name: ai_api_prompts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_api_prompts (
    id integer NOT NULL,
    topic_key character varying(60) NOT NULL,
    difficulty character varying(10) NOT NULL,
    prompt text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_api_prompts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_api_prompts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_api_prompts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_api_prompts_id_seq OWNED BY public.ai_api_prompts.id;


--
-- Name: ai_api_topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_api_topics (
    id integer NOT NULL,
    topic_key character varying(60) NOT NULL,
    topic_title text,
    provider_type character varying(20) DEFAULT 'local'::character varying NOT NULL,
    api_key text,
    base_url text,
    priority integer DEFAULT 10 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_api_topics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_api_topics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_api_topics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_api_topics_id_seq OWNED BY public.ai_api_topics.id;


--
-- Name: ai_prompts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_prompts (
    id integer NOT NULL,
    topic text NOT NULL,
    level text,
    prompt text NOT NULL
);


--
-- Name: ai_prompts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_prompts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_prompts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_prompts_id_seq OWNED BY public.ai_prompts.id;


--
-- Name: api_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_connections (
    id integer NOT NULL,
    topic text NOT NULL,
    model text,
    api_key text,
    base_url text,
    is_default boolean DEFAULT false NOT NULL
);


--
-- Name: api_connections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.api_connections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: api_connections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.api_connections_id_seq OWNED BY public.api_connections.id;


--
-- Name: app_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_roles (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    parent_role_id integer,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: app_roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.app_roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: app_roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.app_roles_id_seq OWNED BY public.app_roles.id;


--
-- Name: app_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_users (
    id integer NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    mobile character varying(20) NOT NULL,
    telegram_handle character varying(64),
    position_title character varying(100),
    manager_name character varying(100),
    username character varying(50) NOT NULL,
    password_hash character varying(255) NOT NULL,
    telegram_code character varying(10),
    status character varying(20) DEFAULT 'PENDING_CODE'::character varying NOT NULL,
    role character varying(20) DEFAULT 'USER'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    role_id integer,
    manager_id integer,
    CONSTRAINT app_users_status_check CHECK (((status)::text = ANY (ARRAY[('PENDING_CODE'::character varying)::text, ('PENDING_APPROVAL'::character varying)::text, ('APPROVED'::character varying)::text, ('REJECTED'::character varying)::text, ('DISABLED'::character varying)::text])))
);


--
-- Name: app_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.app_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: app_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.app_users_id_seq OWNED BY public.app_users.id;


--
-- Name: auth_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_type character varying(20) NOT NULL,
    account_id text,
    event character varying(50) NOT NULL,
    ip character varying(64),
    user_agent text,
    meta jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: automation_ai_prompts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_ai_prompts (
    id integer NOT NULL,
    item_type character varying(20) NOT NULL,
    prompt_template text NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT automation_ai_prompts_item_type_check CHECK (((item_type)::text = ANY (ARRAY[('request'::character varying)::text, ('announcement'::character varying)::text, ('referral'::character varying)::text])))
);


--
-- Name: TABLE automation_ai_prompts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.automation_ai_prompts IS 'قالبهای prompt برای فرمت کردن انواع مختلف اسناد اداری';


--
-- Name: COLUMN automation_ai_prompts.prompt_template; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.automation_ai_prompts.prompt_template IS 'متن prompt با placeholders: {topic_title}, {draft_template}, {transcript_text}';


--
-- Name: automation_ai_prompts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.automation_ai_prompts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: automation_ai_prompts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.automation_ai_prompts_id_seq OWNED BY public.automation_ai_prompts.id;


--
-- Name: automation_ai_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_ai_settings (
    id integer NOT NULL,
    provider_type character varying(20) DEFAULT 'local'::character varying NOT NULL,
    base_url text,
    api_key text,
    model_name character varying(100),
    max_tokens integer DEFAULT 500,
    temperature numeric(3,2) DEFAULT 0.7,
    enabled boolean DEFAULT false NOT NULL,
    timeout_seconds integer DEFAULT 30,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT automation_ai_settings_provider_type_check CHECK (((provider_type)::text = ANY (ARRAY[('local'::character varying)::text, ('cloud'::character varying)::text, ('hybrid'::character varying)::text])))
);


--
-- Name: TABLE automation_ai_settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.automation_ai_settings IS 'تنظیمات API هوش مصنوعی برای فرمت کردن متنهای اتوماسیون اداری';


--
-- Name: COLUMN automation_ai_settings.provider_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.automation_ai_settings.provider_type IS 'نوع سرویس: local (مثل Ollama), cloud (مثل OpenAI), hybrid';


--
-- Name: COLUMN automation_ai_settings.base_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.automation_ai_settings.base_url IS 'آدرس API - مثال: http://localhost:11434/api/generate';


--
-- Name: COLUMN automation_ai_settings.api_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.automation_ai_settings.api_key IS 'کلید API (در صورت نیاز برای cloud providers)';


--
-- Name: COLUMN automation_ai_settings.model_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.automation_ai_settings.model_name IS 'نام مدل - مثال: llama2, gpt-3.5-turbo';


--
-- Name: automation_ai_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.automation_ai_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: automation_ai_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.automation_ai_settings_id_seq OWNED BY public.automation_ai_settings.id;


--
-- Name: automation_item_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_item_logs (
    id integer NOT NULL,
    item_id integer NOT NULL,
    action_type character varying(30) NOT NULL,
    action_by_user_id uuid,
    action_at timestamp without time zone DEFAULT now(),
    note text,
    voice_path text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT automation_item_logs_action_type_check CHECK (((action_type)::text = ANY (ARRAY[('created'::character varying)::text, ('sent'::character varying)::text, ('received'::character varying)::text, ('read'::character varying)::text, ('approved'::character varying)::text, ('rejected'::character varying)::text, ('acknowledged'::character varying)::text, ('forwarded_as_request'::character varying)::text, ('forwarded_as_referral'::character varying)::text, ('forwarded_as_announcement'::character varying)::text, ('reminded_48h'::character varying)::text])))
);


--
-- Name: automation_item_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.automation_item_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: automation_item_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.automation_item_logs_id_seq OWNED BY public.automation_item_logs.id;


--
-- Name: automation_item_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_item_recipients (
    id integer NOT NULL,
    item_id integer NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    status character varying(20) DEFAULT 'pending'::character varying,
    action_at timestamp without time zone,
    CONSTRAINT automation_item_recipients_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('read'::character varying)::text, ('approved'::character varying)::text, ('rejected'::character varying)::text, ('acknowledged'::character varying)::text])))
);


--
-- Name: automation_item_recipients_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.automation_item_recipients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: automation_item_recipients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.automation_item_recipients_id_seq OWNED BY public.automation_item_recipients.id;


--
-- Name: automation_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_items (
    id bigint NOT NULL,
    item_type text NOT NULL,
    topic_id bigint,
    body_text text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid,
    approver_user_id uuid,
    parent_item_id integer
);


--
-- Name: automation_item_threads; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.automation_item_threads AS
 WITH RECURSIVE thread AS (
         SELECT automation_items.id,
            automation_items.parent_item_id,
            automation_items.item_type,
            automation_items.topic_id,
            automation_items.created_by_user_id,
            automation_items.created_at,
            automation_items.status,
            0 AS depth,
            ARRAY[automation_items.id] AS path
           FROM public.automation_items
          WHERE (automation_items.parent_item_id IS NULL)
        UNION ALL
         SELECT ai.id,
            ai.parent_item_id,
            ai.item_type,
            ai.topic_id,
            ai.created_by_user_id,
            ai.created_at,
            ai.status,
            (t.depth + 1),
            (t.path || ai.id)
           FROM (public.automation_items ai
             JOIN thread t ON ((ai.parent_item_id = t.id)))
          WHERE (t.depth < 10)
        )
 SELECT thread.id,
    thread.parent_item_id,
    thread.item_type,
    thread.topic_id,
    thread.created_by_user_id,
    thread.created_at,
    thread.status,
    thread.depth,
    thread.path
   FROM thread
  ORDER BY thread.path;


--
-- Name: automation_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.automation_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: automation_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.automation_items_id_seq OWNED BY public.automation_items.id;


--
-- Name: automation_topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_topics (
    id bigint NOT NULL,
    title text NOT NULL,
    is_for_request boolean DEFAULT false NOT NULL,
    is_for_referral boolean DEFAULT false NOT NULL,
    is_for_announcement boolean DEFAULT false NOT NULL,
    draft_template text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: automation_topics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.automation_topics_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: automation_topics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.automation_topics_id_seq OWNED BY public.automation_topics.id;


--
-- Name: baskets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baskets (
    id integer NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: baskets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.baskets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: baskets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.baskets_id_seq OWNED BY public.baskets.id;


--
-- Name: brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brands (
    id integer NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    code text,
    manager_user_id uuid
);


--
-- Name: brands_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.brands_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: brands_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.brands_id_seq OWNED BY public.brands.id;


--
-- Name: catalog_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_items (
    key text NOT NULL,
    type text,
    title text NOT NULL,
    description text,
    route_admin text,
    route_user text,
    parent_key text,
    order_index integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: credit_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_requests (
    id integer NOT NULL,
    user_id uuid NOT NULL,
    customer_code text,
    amount numeric(18,2) NOT NULL,
    due_date date,
    guarantor_user_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    confirmations_json jsonb
);


--
-- Name: credit_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.credit_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: credit_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.credit_requests_id_seq OWNED BY public.credit_requests.id;


--
-- Name: credit_sale_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_sale_requests (
    id bigint NOT NULL,
    requester_user_id uuid NOT NULL,
    seller_user_id uuid NOT NULL,
    requester_org_node_id integer,
    seller_org_node_id integer,
    customer_code text NOT NULL,
    customer_name text,
    customer_phone text,
    invoice_amount bigint NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    due_days integer NOT NULL,
    due_date date NOT NULL,
    controls_passed boolean DEFAULT false NOT NULL,
    controls_error text,
    controls_checked_at timestamp with time zone,
    approver1_user_id uuid,
    approver2_user_id uuid,
    finance_required boolean DEFAULT false NOT NULL,
    finance_user_id uuid,
    approver1_status text DEFAULT 'pending'::text NOT NULL,
    approver2_status text DEFAULT 'pending'::text NOT NULL,
    finance_status text DEFAULT 'pending'::text NOT NULL,
    approver1_decided_at timestamp with time zone,
    approver2_decided_at timestamp with time zone,
    finance_decided_at timestamp with time zone,
    final_status text DEFAULT 'pending_controls'::text NOT NULL,
    approved_at timestamp with time zone,
    rejected_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    approver1_node_id integer,
    approver2_node_id integer,
    settled_at timestamp with time zone,
    CONSTRAINT chk_approver_nodes_distinct CHECK (((approver2_node_id IS NULL) OR (approver2_node_id <> approver1_node_id))),
    CONSTRAINT chk_approvers_distinct CHECK (((approver1_user_id IS NULL) OR (approver2_user_id IS NULL) OR (approver1_user_id <> approver2_user_id))),
    CONSTRAINT chk_credit_amount_positive CHECK ((invoice_amount > 0)),
    CONSTRAINT chk_due_days_nonneg CHECK ((due_days >= 0)),
    CONSTRAINT chk_finance_distinct CHECK (((finance_user_id IS NULL) OR (((approver1_user_id IS NULL) OR (finance_user_id <> approver1_user_id)) AND ((approver2_user_id IS NULL) OR (finance_user_id <> approver2_user_id))))),
    CONSTRAINT chk_status_values CHECK (((final_status = ANY (ARRAY['pending_controls'::text, 'pending_approvals'::text, 'approved'::text, 'rejected'::text, 'settled'::text, 'cancelled'::text])) AND (approver1_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'skipped'::text])) AND (approver2_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'skipped'::text])) AND (finance_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'skipped'::text]))))
);


--
-- Name: credit_sale_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.credit_sale_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: credit_sale_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.credit_sale_requests_id_seq OWNED BY public.credit_sale_requests.id;


--
-- Name: credit_settlement_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_settlement_requests (
    id bigint NOT NULL,
    credit_request_id bigint NOT NULL,
    requested_by_user_id uuid NOT NULL,
    finance_user_id uuid NOT NULL,
    settlement_type text NOT NULL,
    settlement_ref_no text,
    notes text,
    status text DEFAULT 'pending'::text NOT NULL,
    decided_at timestamp with time zone,
    decided_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_settlement_status CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT chk_settlement_type CHECK ((settlement_type = ANY (ARRAY['cheque'::text, 'cash'::text, 'transfer'::text, 'other'::text])))
);


--
-- Name: credit_settlement_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.credit_settlement_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: credit_settlement_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.credit_settlement_requests_id_seq OWNED BY public.credit_settlement_requests.id;


--
-- Name: customer_industries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_industries (
    id bigint NOT NULL,
    title text NOT NULL,
    parent_id bigint,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: customer_industries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customer_industries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customer_industries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customer_industries_id_seq OWNED BY public.customer_industries.id;


--
-- Name: customer_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_types (
    id integer NOT NULL,
    name text NOT NULL
);


--
-- Name: customer_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customer_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customer_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customer_types_id_seq OWNED BY public.customer_types.id;


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    type_id integer,
    location jsonb,
    address_text text,
    credit_lock_until date
);


--
-- Name: customers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customers_id_seq OWNED BY public.customers.id;


--
-- Name: debts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.debts (
    id integer NOT NULL,
    seller_id uuid NOT NULL,
    customer_code text,
    invoice_number text,
    amount numeric(18,2) NOT NULL,
    due_date date,
    source text,
    status text DEFAULT 'open'::text NOT NULL,
    exit_reason text,
    accountant_confirm boolean DEFAULT false NOT NULL
);


--
-- Name: debts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.debts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: debts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.debts_id_seq OWNED BY public.debts.id;


--
-- Name: exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exercises (
    id integer NOT NULL,
    user_id uuid NOT NULL,
    priority integer,
    topic text,
    description text,
    daily_count integer,
    duration_days integer
);


--
-- Name: exercises_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exercises_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exercises_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exercises_id_seq OWNED BY public.exercises.id;


--
-- Name: forgotten_key_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forgotten_key_products (
    id integer NOT NULL,
    user_id uuid NOT NULL,
    customer_id integer,
    product_id integer,
    last_mention timestamp with time zone,
    opportunity_days integer,
    action text
);


--
-- Name: forgotten_key_products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.forgotten_key_products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: forgotten_key_products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.forgotten_key_products_id_seq OWNED BY public.forgotten_key_products.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: org_credit_policy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_credit_policy (
    org_node_id integer NOT NULL,
    approver1_node_id integer NOT NULL,
    approver2_node_id integer,
    finance_required boolean DEFAULT false NOT NULL,
    finance_user_id uuid,
    max_open_invoices_per_user integer,
    max_open_amount_per_user bigint,
    max_open_invoices_per_customer integer,
    max_open_amount_per_customer bigint,
    max_invoice_amount bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_policy_approver_nodes_distinct CHECK (((approver2_node_id IS NULL) OR (approver2_node_id <> approver1_node_id))),
    CONSTRAINT chk_policy_positive_amounts CHECK ((((max_open_amount_per_user IS NULL) OR (max_open_amount_per_user >= 0)) AND ((max_open_amount_per_customer IS NULL) OR (max_open_amount_per_customer >= 0)) AND ((max_invoice_amount IS NULL) OR (max_invoice_amount >= 0)))),
    CONSTRAINT chk_policy_positive_ints CHECK ((((max_open_invoices_per_user IS NULL) OR (max_open_invoices_per_user >= 1)) AND ((max_open_invoices_per_customer IS NULL) OR (max_open_invoices_per_customer >= 1))))
);


--
-- Name: org_node_catalog_mode; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_node_catalog_mode (
    org_node_id integer NOT NULL,
    mode text DEFAULT 'USER'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: org_node_edges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_node_edges (
    child_id integer NOT NULL,
    parent_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_node_edges_no_self CHECK ((child_id IS DISTINCT FROM parent_id))
);


--
-- Name: org_node_item_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_node_item_access (
    org_node_id integer NOT NULL,
    item_key text NOT NULL,
    visible boolean DEFAULT false NOT NULL,
    show_on_dashboard boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: org_nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_nodes (
    id integer NOT NULL,
    title text NOT NULL,
    parent_id integer,
    level integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    requires_credit_approval boolean DEFAULT false NOT NULL,
    branch text DEFAULT 'ORG'::text NOT NULL,
    CONSTRAINT org_nodes_level_range_chk CHECK (((level >= 1) AND (level <= 10)))
);


--
-- Name: org_nodes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_nodes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_nodes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_nodes_id_seq OWNED BY public.org_nodes.id;


--
-- Name: otp_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otp_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_type character varying(20) NOT NULL,
    account_id text NOT NULL,
    otp_hash character varying(255) NOT NULL,
    channel character varying(20) DEFAULT 'telegram'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    consumed_at timestamp without time zone
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id integer NOT NULL,
    brand_id integer NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    aliases text[] DEFAULT ARRAY[]::text[] NOT NULL,
    is_key boolean DEFAULT false NOT NULL,
    sku_code text
);


--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.products_id_seq OWNED BY public.products.id;


--
-- Name: report_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_catalog (
    key text NOT NULL,
    title text NOT NULL,
    description text,
    scope text NOT NULL,
    group_key text NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sources text[] DEFAULT '{}'::text[] NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT report_catalog_group_key_check CHECK ((group_key = ANY (ARRAY['my'::text, 'team'::text, 'rivals'::text, 'company'::text]))),
    CONSTRAINT report_catalog_scope_check CHECK ((scope = ANY (ARRAY['MY'::text, 'TEAM'::text, 'RIVALS'::text, 'COMPANY'::text])))
);


--
-- Name: report_widget_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_widget_catalog (
    id integer NOT NULL,
    report_key text,
    widget_key text,
    title text,
    chart_type text,
    unit text,
    query_id text,
    order_index integer DEFAULT 0,
    config jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: report_widget_catalog_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.report_widget_catalog_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: report_widget_catalog_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.report_widget_catalog_id_seq OWNED BY public.report_widget_catalog.id;


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


--
-- Name: system_admin_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_admin_audit_log (
    id bigint NOT NULL,
    admin_id uuid,
    action text NOT NULL,
    meta jsonb,
    ip text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: system_admin_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.system_admin_audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: system_admin_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.system_admin_audit_log_id_seq OWNED BY public.system_admin_audit_log.id;


--
-- Name: system_admin_otps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_admin_otps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: system_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_admins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    telegram_id text,
    is_active boolean DEFAULT true NOT NULL,
    failed_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login_at timestamp with time zone,
    must_change_password boolean DEFAULT true NOT NULL,
    password_updated_at timestamp with time zone
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    id integer NOT NULL,
    key text NOT NULL,
    value text
);


--
-- Name: system_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.system_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: system_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.system_settings_id_seq OWNED BY public.system_settings.id;


--
-- Name: tbl_basket_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_basket_types (
    id bigint NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_basket_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tbl_basket_types_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_basket_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tbl_basket_types_id_seq OWNED BY public.tbl_basket_types.id;


--
-- Name: tbl_baskets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_baskets (
    id bigint NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_baskets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tbl_baskets_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_baskets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tbl_baskets_id_seq OWNED BY public.tbl_baskets.id;


--
-- Name: tbl_brand_managers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_brand_managers (
    id bigint NOT NULL,
    telegram_id text,
    active boolean DEFAULT true NOT NULL,
    full_name text,
    phone text
);


--
-- Name: tbl_brand_managers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tbl_brand_managers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_brand_managers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tbl_brand_managers_id_seq OWNED BY public.tbl_brand_managers.id;


--
-- Name: tbl_brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_brands (
    id bigint NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    basket_type text
);


--
-- Name: tbl_brands_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tbl_brands_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_brands_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tbl_brands_id_seq OWNED BY public.tbl_brands.id;


--
-- Name: tbl_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_products (
    id bigint NOT NULL,
    brand_id bigint,
    name text NOT NULL,
    sku text,
    active boolean DEFAULT true NOT NULL
);


--
-- Name: tbl_products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tbl_products_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tbl_products_id_seq OWNED BY public.tbl_products.id;


--
-- Name: tbl_sales_managers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_sales_managers (
    id bigint NOT NULL,
    telegram_id text,
    active boolean DEFAULT true NOT NULL,
    full_name text,
    phone text,
    senior_sales_manager_id bigint
);


--
-- Name: tbl_sales_managers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tbl_sales_managers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_sales_managers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tbl_sales_managers_id_seq OWNED BY public.tbl_sales_managers.id;


--
-- Name: tbl_sellers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_sellers (
    id bigint NOT NULL,
    telegram_id text,
    active boolean DEFAULT true NOT NULL,
    full_name text,
    phone text,
    supervisor_id bigint
);


--
-- Name: tbl_sellers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tbl_sellers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_sellers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tbl_sellers_id_seq OWNED BY public.tbl_sellers.id;


--
-- Name: tbl_senior_sales_managers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_senior_sales_managers (
    id bigint NOT NULL,
    telegram_id text,
    active boolean DEFAULT true NOT NULL,
    full_name text,
    phone text,
    brand_manager_id bigint
);


--
-- Name: tbl_senior_sales_managers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tbl_senior_sales_managers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_senior_sales_managers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tbl_senior_sales_managers_id_seq OWNED BY public.tbl_senior_sales_managers.id;


--
-- Name: tbl_supervisors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_supervisors (
    id bigint NOT NULL,
    telegram_id text,
    active boolean DEFAULT true NOT NULL,
    full_name text,
    phone text,
    sales_manager_id bigint
);


--
-- Name: tbl_supervisors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tbl_supervisors_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_supervisors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tbl_supervisors_id_seq OWNED BY public.tbl_supervisors.id;


--
-- Name: team_brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_brands (
    team_id bigint NOT NULL,
    brand_id integer NOT NULL,
    priority smallint DEFAULT 3 NOT NULL,
    CONSTRAINT team_brands_priority_range CHECK (((priority >= 1) AND (priority <= 5)))
);


--
-- Name: team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_members (
    team_id bigint NOT NULL,
    user_id uuid NOT NULL,
    role text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT team_members_role_only_member CHECK ((role = 'member'::text))
);


--
-- Name: team_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_users (
    team_id bigint NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    accounting_code text,
    CONSTRAINT team_users_role_chk CHECK ((upper(role) = ANY (ARRAY['MANAGER'::text, 'LEADER'::text, 'MEMBER'::text]))),
    CONSTRAINT team_users_role_only_member CHECK ((role = 'member'::text))
);


--
-- Name: team_members_view_backup_20251220_194024; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.team_members_view_backup_20251220_194024 AS
 SELECT team_users.team_id,
    team_users.user_id,
    team_users.role,
    team_users.active,
    team_users.created_at,
    team_users.updated_at
   FROM public.team_users;


--
-- Name: teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teams (
    id bigint NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    org_node_id integer
);


--
-- Name: teams_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.teams_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: teams_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.teams_id_seq OWNED BY public.teams.id;


--
-- Name: training_company_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_company_settings (
    id bigint NOT NULL,
    company_id uuid,
    pass_score integer DEFAULT 70 NOT NULL,
    window_size integer DEFAULT 3 NOT NULL,
    initial_eval_count integer DEFAULT 3 NOT NULL,
    default_mode text DEFAULT 'logical'::text NOT NULL,
    training_priority_enabled boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    baseline_voices_count integer DEFAULT 3 NOT NULL,
    rolling_window_n integer DEFAULT 3 NOT NULL,
    threshold_score integer DEFAULT 70 NOT NULL
);


--
-- Name: training_company_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.training_company_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: training_company_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.training_company_settings_id_seq OWNED BY public.training_company_settings.id;


--
-- Name: training_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_logs (
    id integer NOT NULL,
    user_id uuid,
    transcript text,
    speaker_match_score numeric(5,2),
    suspicious boolean DEFAULT false,
    meta jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: training_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.training_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: training_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.training_logs_id_seq OWNED BY public.training_logs.id;


--
-- Name: training_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_scores (
    id integer NOT NULL,
    user_id uuid NOT NULL,
    topic_key text NOT NULL,
    voice_log_id text,
    score integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT training_scores_score_range CHECK (((score >= 0) AND (score <= 100)))
);


--
-- Name: training_scores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.training_scores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: training_scores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.training_scores_id_seq OWNED BY public.training_scores.id;


--
-- Name: training_topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_topics (
    id integer NOT NULL,
    company_id uuid,
    topic_key text NOT NULL,
    title text,
    order_index integer,
    is_enabled boolean DEFAULT true NOT NULL,
    prompt_simple text,
    prompt_logical text,
    prompt_strict text,
    provider_mode text DEFAULT 'hybrid'::text NOT NULL,
    token text,
    base_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: training_topics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.training_topics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: training_topics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.training_topics_id_seq OWNED BY public.training_topics.id;


--
-- Name: user_confirmations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_confirmations (
    id integer NOT NULL,
    user_id uuid NOT NULL,
    confirmed_by_node_id integer,
    type text NOT NULL,
    confirmed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_confirmations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_confirmations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_confirmations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_confirmations_id_seq OWNED BY public.user_confirmations.id;


--
-- Name: user_priorities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_priorities (
    id integer NOT NULL,
    user_id uuid NOT NULL,
    topic text NOT NULL,
    priority integer,
    duration_days integer,
    target_score integer
);


--
-- Name: user_priorities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_priorities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_priorities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_priorities_id_seq OWNED BY public.user_priorities.id;


--
-- Name: user_product_mentions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_product_mentions (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    product_id integer NOT NULL,
    mentioned_at timestamp with time zone DEFAULT now() NOT NULL,
    source text,
    raw_text text
);


--
-- Name: user_product_mentions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_product_mentions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_product_mentions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_product_mentions_id_seq OWNED BY public.user_product_mentions.id;


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sessions (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp with time zone NOT NULL
);


--
-- Name: user_team_assignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_team_assignment (
    user_id uuid NOT NULL,
    team_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_training_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_training_state (
    user_id uuid NOT NULL,
    user_level integer DEFAULT 1 NOT NULL,
    difficulty_level text,
    baseline_done boolean DEFAULT false NOT NULL,
    baseline_voice_count integer DEFAULT 0 NOT NULL,
    current_topic_key text,
    cycle_id integer DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    full_name text,
    phone text,
    telegram_id text,
    role text DEFAULT 'USER'::text NOT NULL,
    active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending_verification'::text NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    first_name text,
    last_name text,
    verification_code text,
    org_node_id integer,
    manager_id uuid,
    accounting_code text
);


--
-- Name: v_team_key_products; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_team_key_products AS
 SELECT tb.team_id,
    t.name AS team_name,
    tb.brand_id,
    b.name AS brand_name,
    tb.priority AS brand_priority,
    p.id AS product_id,
    p.name AS product_name,
    p.aliases
   FROM (((public.team_brands tb
     JOIN public.teams t ON (((t.id = tb.team_id) AND (t.active = true))))
     JOIN public.brands b ON (((b.id = tb.brand_id) AND (b.is_active = true))))
     JOIN public.products p ON ((p.brand_id = b.id)))
  WHERE ((p.is_active = true) AND (p.is_key = true));


--
-- Name: voice_enrollment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voice_enrollment (
    user_id uuid NOT NULL,
    enrollment_version integer DEFAULT 1 NOT NULL,
    embedding_json text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: voice_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voice_logs (
    id integer NOT NULL,
    user_id uuid NOT NULL,
    customer_id integer,
    gps jsonb,
    meta jsonb,
    keywords text[],
    analysis_json jsonb,
    ai_model text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: voice_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.voice_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: voice_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.voice_logs_id_seq OWNED BY public.voice_logs.id;


--
-- Name: admin_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_settings ALTER COLUMN id SET DEFAULT nextval('public.admin_settings_id_seq'::regclass);


--
-- Name: ai_api_prompts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_api_prompts ALTER COLUMN id SET DEFAULT nextval('public.ai_api_prompts_id_seq'::regclass);


--
-- Name: ai_api_topics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_api_topics ALTER COLUMN id SET DEFAULT nextval('public.ai_api_topics_id_seq'::regclass);


--
-- Name: ai_prompts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_prompts ALTER COLUMN id SET DEFAULT nextval('public.ai_prompts_id_seq'::regclass);


--
-- Name: api_connections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_connections ALTER COLUMN id SET DEFAULT nextval('public.api_connections_id_seq'::regclass);


--
-- Name: app_roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_roles ALTER COLUMN id SET DEFAULT nextval('public.app_roles_id_seq'::regclass);


--
-- Name: app_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users ALTER COLUMN id SET DEFAULT nextval('public.app_users_id_seq'::regclass);


--
-- Name: automation_ai_prompts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_ai_prompts ALTER COLUMN id SET DEFAULT nextval('public.automation_ai_prompts_id_seq'::regclass);


--
-- Name: automation_ai_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_ai_settings ALTER COLUMN id SET DEFAULT nextval('public.automation_ai_settings_id_seq'::regclass);


--
-- Name: automation_item_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_item_logs ALTER COLUMN id SET DEFAULT nextval('public.automation_item_logs_id_seq'::regclass);


--
-- Name: automation_item_recipients id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_item_recipients ALTER COLUMN id SET DEFAULT nextval('public.automation_item_recipients_id_seq'::regclass);


--
-- Name: automation_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_items ALTER COLUMN id SET DEFAULT nextval('public.automation_items_id_seq'::regclass);


--
-- Name: automation_topics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_topics ALTER COLUMN id SET DEFAULT nextval('public.automation_topics_id_seq'::regclass);


--
-- Name: baskets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baskets ALTER COLUMN id SET DEFAULT nextval('public.baskets_id_seq'::regclass);


--
-- Name: brands id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands ALTER COLUMN id SET DEFAULT nextval('public.brands_id_seq'::regclass);


--
-- Name: credit_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_requests ALTER COLUMN id SET DEFAULT nextval('public.credit_requests_id_seq'::regclass);


--
-- Name: credit_sale_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_sale_requests ALTER COLUMN id SET DEFAULT nextval('public.credit_sale_requests_id_seq'::regclass);


--
-- Name: credit_settlement_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_settlement_requests ALTER COLUMN id SET DEFAULT nextval('public.credit_settlement_requests_id_seq'::regclass);


--
-- Name: customer_industries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_industries ALTER COLUMN id SET DEFAULT nextval('public.customer_industries_id_seq'::regclass);


--
-- Name: customer_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_types ALTER COLUMN id SET DEFAULT nextval('public.customer_types_id_seq'::regclass);


--
-- Name: customers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers ALTER COLUMN id SET DEFAULT nextval('public.customers_id_seq'::regclass);


--
-- Name: debts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debts ALTER COLUMN id SET DEFAULT nextval('public.debts_id_seq'::regclass);


--
-- Name: exercises id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercises ALTER COLUMN id SET DEFAULT nextval('public.exercises_id_seq'::regclass);


--
-- Name: forgotten_key_products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forgotten_key_products ALTER COLUMN id SET DEFAULT nextval('public.forgotten_key_products_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: org_nodes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_nodes ALTER COLUMN id SET DEFAULT nextval('public.org_nodes_id_seq'::regclass);


--
-- Name: products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq'::regclass);


--
-- Name: report_widget_catalog id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_widget_catalog ALTER COLUMN id SET DEFAULT nextval('public.report_widget_catalog_id_seq'::regclass);


--
-- Name: system_admin_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_admin_audit_log ALTER COLUMN id SET DEFAULT nextval('public.system_admin_audit_log_id_seq'::regclass);


--
-- Name: system_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings ALTER COLUMN id SET DEFAULT nextval('public.system_settings_id_seq'::regclass);


--
-- Name: tbl_basket_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_basket_types ALTER COLUMN id SET DEFAULT nextval('public.tbl_basket_types_id_seq'::regclass);


--
-- Name: tbl_baskets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_baskets ALTER COLUMN id SET DEFAULT nextval('public.tbl_baskets_id_seq'::regclass);


--
-- Name: tbl_brand_managers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_brand_managers ALTER COLUMN id SET DEFAULT nextval('public.tbl_brand_managers_id_seq'::regclass);


--
-- Name: tbl_brands id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_brands ALTER COLUMN id SET DEFAULT nextval('public.tbl_brands_id_seq'::regclass);


--
-- Name: tbl_products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_products ALTER COLUMN id SET DEFAULT nextval('public.tbl_products_id_seq'::regclass);


--
-- Name: tbl_sales_managers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_managers ALTER COLUMN id SET DEFAULT nextval('public.tbl_sales_managers_id_seq'::regclass);


--
-- Name: tbl_sellers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sellers ALTER COLUMN id SET DEFAULT nextval('public.tbl_sellers_id_seq'::regclass);


--
-- Name: tbl_senior_sales_managers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_senior_sales_managers ALTER COLUMN id SET DEFAULT nextval('public.tbl_senior_sales_managers_id_seq'::regclass);


--
-- Name: tbl_supervisors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_supervisors ALTER COLUMN id SET DEFAULT nextval('public.tbl_supervisors_id_seq'::regclass);


--
-- Name: teams id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams ALTER COLUMN id SET DEFAULT nextval('public.teams_id_seq'::regclass);


--
-- Name: training_company_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_company_settings ALTER COLUMN id SET DEFAULT nextval('public.training_company_settings_id_seq'::regclass);


--
-- Name: training_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_logs ALTER COLUMN id SET DEFAULT nextval('public.training_logs_id_seq'::regclass);


--
-- Name: training_scores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_scores ALTER COLUMN id SET DEFAULT nextval('public.training_scores_id_seq'::regclass);


--
-- Name: training_topics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_topics ALTER COLUMN id SET DEFAULT nextval('public.training_topics_id_seq'::regclass);


--
-- Name: user_confirmations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_confirmations ALTER COLUMN id SET DEFAULT nextval('public.user_confirmations_id_seq'::regclass);


--
-- Name: user_priorities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_priorities ALTER COLUMN id SET DEFAULT nextval('public.user_priorities_id_seq'::regclass);


--
-- Name: user_product_mentions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_product_mentions ALTER COLUMN id SET DEFAULT nextval('public.user_product_mentions_id_seq'::regclass);


--
-- Name: voice_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_logs ALTER COLUMN id SET DEFAULT nextval('public.voice_logs_id_seq'::regclass);


--
-- Name: admin_sessions admin_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_pkey PRIMARY KEY (sid);


--
-- Name: admin_settings admin_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_settings
    ADD CONSTRAINT admin_settings_pkey PRIMARY KEY (id);


--
-- Name: admin_settings admin_settings_subject_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_settings
    ADD CONSTRAINT admin_settings_subject_key_key UNIQUE (subject, key);


--
-- Name: ai_api_prompts ai_api_prompts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_api_prompts
    ADD CONSTRAINT ai_api_prompts_pkey PRIMARY KEY (id);


--
-- Name: ai_api_prompts ai_api_prompts_topic_key_difficulty_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_api_prompts
    ADD CONSTRAINT ai_api_prompts_topic_key_difficulty_key UNIQUE (topic_key, difficulty);


--
-- Name: ai_api_topics ai_api_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_api_topics
    ADD CONSTRAINT ai_api_topics_pkey PRIMARY KEY (id);


--
-- Name: ai_api_topics ai_api_topics_topic_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_api_topics
    ADD CONSTRAINT ai_api_topics_topic_key_key UNIQUE (topic_key);


--
-- Name: ai_prompts ai_prompts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_prompts
    ADD CONSTRAINT ai_prompts_pkey PRIMARY KEY (id);


--
-- Name: api_connections api_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_connections
    ADD CONSTRAINT api_connections_pkey PRIMARY KEY (id);


--
-- Name: app_roles app_roles_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_roles
    ADD CONSTRAINT app_roles_code_key UNIQUE (code);


--
-- Name: app_roles app_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_roles
    ADD CONSTRAINT app_roles_pkey PRIMARY KEY (id);


--
-- Name: app_users app_users_mobile_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_mobile_key UNIQUE (mobile);


--
-- Name: app_users app_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_pkey PRIMARY KEY (id);


--
-- Name: app_users app_users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_username_key UNIQUE (username);


--
-- Name: auth_audit_logs auth_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_audit_logs
    ADD CONSTRAINT auth_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: automation_ai_prompts automation_ai_prompts_item_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_ai_prompts
    ADD CONSTRAINT automation_ai_prompts_item_type_key UNIQUE (item_type);


--
-- Name: automation_ai_prompts automation_ai_prompts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_ai_prompts
    ADD CONSTRAINT automation_ai_prompts_pkey PRIMARY KEY (id);


--
-- Name: automation_ai_settings automation_ai_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_ai_settings
    ADD CONSTRAINT automation_ai_settings_pkey PRIMARY KEY (id);


--
-- Name: automation_item_logs automation_item_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_item_logs
    ADD CONSTRAINT automation_item_logs_pkey PRIMARY KEY (id);


--
-- Name: automation_item_recipients automation_item_recipients_item_user_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_item_recipients
    ADD CONSTRAINT automation_item_recipients_item_user_uniq UNIQUE (item_id, user_id);


--
-- Name: automation_item_recipients automation_item_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_item_recipients
    ADD CONSTRAINT automation_item_recipients_pkey PRIMARY KEY (id);


--
-- Name: automation_items automation_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_items
    ADD CONSTRAINT automation_items_pkey PRIMARY KEY (id);


--
-- Name: automation_topics automation_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_topics
    ADD CONSTRAINT automation_topics_pkey PRIMARY KEY (id);


--
-- Name: baskets baskets_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baskets
    ADD CONSTRAINT baskets_name_key UNIQUE (name);


--
-- Name: baskets baskets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baskets
    ADD CONSTRAINT baskets_pkey PRIMARY KEY (id);


--
-- Name: brands brands_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_name_key UNIQUE (name);


--
-- Name: brands brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_pkey PRIMARY KEY (id);


--
-- Name: catalog_items catalog_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_items
    ADD CONSTRAINT catalog_items_pkey PRIMARY KEY (key);


--
-- Name: credit_requests credit_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_requests
    ADD CONSTRAINT credit_requests_pkey PRIMARY KEY (id);


--
-- Name: credit_sale_requests credit_sale_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_sale_requests
    ADD CONSTRAINT credit_sale_requests_pkey PRIMARY KEY (id);


--
-- Name: credit_settlement_requests credit_settlement_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_settlement_requests
    ADD CONSTRAINT credit_settlement_requests_pkey PRIMARY KEY (id);


--
-- Name: customer_industries customer_industries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_industries
    ADD CONSTRAINT customer_industries_pkey PRIMARY KEY (id);


--
-- Name: customer_types customer_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_types
    ADD CONSTRAINT customer_types_pkey PRIMARY KEY (id);


--
-- Name: customers customers_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_code_key UNIQUE (code);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: debts debts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_pkey PRIMARY KEY (id);


--
-- Name: exercises exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercises
    ADD CONSTRAINT exercises_pkey PRIMARY KEY (id);


--
-- Name: forgotten_key_products forgotten_key_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forgotten_key_products
    ADD CONSTRAINT forgotten_key_products_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: org_credit_policy org_credit_policy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_credit_policy
    ADD CONSTRAINT org_credit_policy_pkey PRIMARY KEY (org_node_id);


--
-- Name: org_node_catalog_mode org_node_catalog_mode_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_node_catalog_mode
    ADD CONSTRAINT org_node_catalog_mode_pkey PRIMARY KEY (org_node_id);


--
-- Name: org_node_edges org_node_edges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_node_edges
    ADD CONSTRAINT org_node_edges_pkey PRIMARY KEY (child_id);


--
-- Name: org_node_item_access org_node_item_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_node_item_access
    ADD CONSTRAINT org_node_item_access_pkey PRIMARY KEY (org_node_id, item_key);


--
-- Name: org_nodes org_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_nodes
    ADD CONSTRAINT org_nodes_pkey PRIMARY KEY (id);


--
-- Name: org_nodes org_nodes_title_parent_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_nodes
    ADD CONSTRAINT org_nodes_title_parent_id_key UNIQUE (title, parent_id);


--
-- Name: otp_challenges otp_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_challenges
    ADD CONSTRAINT otp_challenges_pkey PRIMARY KEY (id);


--
-- Name: products products_brand_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_brand_id_name_key UNIQUE (brand_id, name);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: report_catalog report_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_catalog
    ADD CONSTRAINT report_catalog_pkey PRIMARY KEY (key);


--
-- Name: report_widget_catalog report_widget_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_widget_catalog
    ADD CONSTRAINT report_widget_catalog_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: system_admin_audit_log system_admin_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_admin_audit_log
    ADD CONSTRAINT system_admin_audit_log_pkey PRIMARY KEY (id);


--
-- Name: system_admin_otps system_admin_otps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_admin_otps
    ADD CONSTRAINT system_admin_otps_pkey PRIMARY KEY (id);


--
-- Name: system_admins system_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_admins
    ADD CONSTRAINT system_admins_pkey PRIMARY KEY (id);


--
-- Name: system_admins system_admins_telegram_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_admins
    ADD CONSTRAINT system_admins_telegram_id_key UNIQUE (telegram_id);


--
-- Name: system_admins system_admins_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_admins
    ADD CONSTRAINT system_admins_username_key UNIQUE (username);


--
-- Name: system_settings system_settings_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_key_key UNIQUE (key);


--
-- Name: system_settings system_settings_key_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_key_uk UNIQUE (key);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: tbl_basket_types tbl_basket_types_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_basket_types
    ADD CONSTRAINT tbl_basket_types_name_key UNIQUE (name);


--
-- Name: tbl_basket_types tbl_basket_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_basket_types
    ADD CONSTRAINT tbl_basket_types_pkey PRIMARY KEY (id);


--
-- Name: tbl_baskets tbl_baskets_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_baskets
    ADD CONSTRAINT tbl_baskets_name_key UNIQUE (name);


--
-- Name: tbl_baskets tbl_baskets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_baskets
    ADD CONSTRAINT tbl_baskets_pkey PRIMARY KEY (id);


--
-- Name: tbl_brand_managers tbl_brand_managers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_brand_managers
    ADD CONSTRAINT tbl_brand_managers_pkey PRIMARY KEY (id);


--
-- Name: tbl_brands tbl_brands_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_brands
    ADD CONSTRAINT tbl_brands_name_key UNIQUE (name);


--
-- Name: tbl_brands tbl_brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_brands
    ADD CONSTRAINT tbl_brands_pkey PRIMARY KEY (id);


--
-- Name: tbl_products tbl_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_products
    ADD CONSTRAINT tbl_products_pkey PRIMARY KEY (id);


--
-- Name: tbl_sales_managers tbl_sales_managers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_managers
    ADD CONSTRAINT tbl_sales_managers_pkey PRIMARY KEY (id);


--
-- Name: tbl_sellers tbl_sellers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sellers
    ADD CONSTRAINT tbl_sellers_pkey PRIMARY KEY (id);


--
-- Name: tbl_senior_sales_managers tbl_senior_sales_managers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_senior_sales_managers
    ADD CONSTRAINT tbl_senior_sales_managers_pkey PRIMARY KEY (id);


--
-- Name: tbl_supervisors tbl_supervisors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_supervisors
    ADD CONSTRAINT tbl_supervisors_pkey PRIMARY KEY (id);


--
-- Name: team_brands team_brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_brands
    ADD CONSTRAINT team_brands_pkey PRIMARY KEY (team_id, brand_id);


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (team_id, user_id);


--
-- Name: team_users team_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_users
    ADD CONSTRAINT team_users_pkey PRIMARY KEY (team_id, user_id, role);


--
-- Name: teams teams_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_name_key UNIQUE (name);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: training_company_settings training_company_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_company_settings
    ADD CONSTRAINT training_company_settings_pkey PRIMARY KEY (id);


--
-- Name: training_logs training_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_logs
    ADD CONSTRAINT training_logs_pkey PRIMARY KEY (id);


--
-- Name: training_scores training_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_scores
    ADD CONSTRAINT training_scores_pkey PRIMARY KEY (id);


--
-- Name: training_topics training_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_topics
    ADD CONSTRAINT training_topics_pkey PRIMARY KEY (id);


--
-- Name: user_confirmations user_confirmations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_confirmations
    ADD CONSTRAINT user_confirmations_pkey PRIMARY KEY (id);


--
-- Name: user_priorities user_priorities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_priorities
    ADD CONSTRAINT user_priorities_pkey PRIMARY KEY (id);


--
-- Name: user_product_mentions user_product_mentions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_product_mentions
    ADD CONSTRAINT user_product_mentions_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (sid);


--
-- Name: user_team_assignment user_team_assignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_team_assignment
    ADD CONSTRAINT user_team_assignment_pkey PRIMARY KEY (user_id);


--
-- Name: user_training_state user_training_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_training_state
    ADD CONSTRAINT user_training_state_pkey PRIMARY KEY (user_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: users users_username_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_uk UNIQUE (username);


--
-- Name: voice_enrollment voice_enrollment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_enrollment
    ADD CONSTRAINT voice_enrollment_pkey PRIMARY KEY (user_id, enrollment_version);


--
-- Name: voice_logs voice_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_logs
    ADD CONSTRAINT voice_logs_pkey PRIMARY KEY (id);


--
-- Name: IDX_admin_sessions_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_admin_sessions_expire" ON public.admin_sessions USING btree (expire);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_session_expire" ON public.session USING btree (expire);


--
-- Name: IDX_user_sessions_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_user_sessions_expire" ON public.user_sessions USING btree (expire);


--
-- Name: brands_code_uk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX brands_code_uk ON public.brands USING btree (code) WHERE (code IS NOT NULL);


--
-- Name: idx_air_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_air_user_status ON public.automation_item_recipients USING btree (user_id, status);


--
-- Name: idx_app_users_mobile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_users_mobile ON public.app_users USING btree (mobile);


--
-- Name: idx_app_users_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_users_username ON public.app_users USING btree (username);


--
-- Name: idx_automation_ai_prompts_type_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_automation_ai_prompts_type_active ON public.automation_ai_prompts USING btree (item_type) WHERE (is_active = true);


--
-- Name: idx_automation_ai_settings_singleton; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_automation_ai_settings_singleton ON public.automation_ai_settings USING btree ((1));


--
-- Name: idx_automation_items_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_automation_items_created_by ON public.automation_items USING btree (created_by_user_id);


--
-- Name: idx_automation_items_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_automation_items_parent ON public.automation_items USING btree (parent_item_id);


--
-- Name: idx_automation_items_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_automation_items_pending ON public.automation_items USING btree (status, approver_user_id, id DESC);


--
-- Name: idx_automation_items_topic; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_automation_items_topic ON public.automation_items USING btree (topic_id);


--
-- Name: idx_automation_logs_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_automation_logs_item ON public.automation_item_logs USING btree (item_id, action_at DESC);


--
-- Name: idx_automation_logs_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_automation_logs_type ON public.automation_item_logs USING btree (action_type);


--
-- Name: idx_automation_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_automation_logs_user ON public.automation_item_logs USING btree (action_by_user_id);


--
-- Name: idx_automation_topics_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_automation_topics_sort ON public.automation_topics USING btree (sort_order, id DESC);


--
-- Name: idx_brands_manager_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brands_manager_user_id ON public.brands USING btree (manager_user_id);


--
-- Name: idx_csr_appr1_node_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_csr_appr1_node_status ON public.credit_sale_requests USING btree (approver1_node_id, approver1_status, final_status);


--
-- Name: idx_csr_appr2_node_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_csr_appr2_node_status ON public.credit_sale_requests USING btree (approver2_node_id, approver2_status, final_status);


--
-- Name: idx_csr_customer_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_csr_customer_status ON public.credit_sale_requests USING btree (customer_code, final_status);


--
-- Name: idx_csr_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_csr_due_date ON public.credit_sale_requests USING btree (due_date);


--
-- Name: idx_csr_requested_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_csr_requested_at ON public.credit_sale_requests USING btree (requested_at);


--
-- Name: idx_csr_seller_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_csr_seller_status ON public.credit_sale_requests USING btree (seller_user_id, final_status);


--
-- Name: idx_customer_industries_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_industries_parent ON public.customer_industries USING btree (parent_id);


--
-- Name: idx_customer_industries_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_industries_sort ON public.customer_industries USING btree (sort_order, id DESC);


--
-- Name: idx_mentions_user_product_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mentions_user_product_time ON public.user_product_mentions USING btree (user_id, product_id, mentioned_at DESC);


--
-- Name: idx_mentions_user_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mentions_user_time ON public.user_product_mentions USING btree (user_id, mentioned_at DESC);


--
-- Name: idx_org_node_edges_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_node_edges_parent ON public.org_node_edges USING btree (parent_id);


--
-- Name: idx_org_nodes_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_nodes_branch ON public.org_nodes USING btree (branch);


--
-- Name: idx_org_nodes_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_nodes_parent ON public.org_nodes USING btree (parent_id);


--
-- Name: idx_org_nodes_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_nodes_parent_id ON public.org_nodes USING btree (parent_id);


--
-- Name: idx_otp_challenges_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_challenges_lookup ON public.otp_challenges USING btree (account_type, account_id, expires_at);


--
-- Name: idx_products_aliases_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_aliases_gin ON public.products USING gin (aliases);


--
-- Name: idx_products_brand_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_brand_id ON public.products USING btree (brand_id);


--
-- Name: idx_report_widget_catalog_report_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_report_widget_catalog_report_order ON public.report_widget_catalog USING btree (report_key, order_index, id);


--
-- Name: idx_settle_credit_req; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_settle_credit_req ON public.credit_settlement_requests USING btree (credit_request_id, status);


--
-- Name: idx_settle_finance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_settle_finance ON public.credit_settlement_requests USING btree (finance_user_id, status);


--
-- Name: idx_system_admin_otps_admin_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_admin_otps_admin_id ON public.system_admin_otps USING btree (admin_id);


--
-- Name: idx_system_admin_otps_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_admin_otps_expires ON public.system_admin_otps USING btree (expires_at);


--
-- Name: idx_team_brands_team_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_brands_team_brand ON public.team_brands USING btree (team_id, brand_id);


--
-- Name: idx_team_brands_team_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_brands_team_priority ON public.team_brands USING btree (team_id, priority);


--
-- Name: idx_team_members_team_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_members_team_active ON public.team_members USING btree (team_id, active);


--
-- Name: idx_team_members_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_members_team_id ON public.team_members USING btree (team_id);


--
-- Name: idx_team_members_team_user_uk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_team_members_team_user_uk ON public.team_members USING btree (team_id, user_id);


--
-- Name: idx_team_members_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_members_user_id ON public.team_members USING btree (user_id);


--
-- Name: idx_team_users_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_users_team_id ON public.team_users USING btree (team_id);


--
-- Name: idx_team_users_team_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_users_team_role ON public.team_users USING btree (team_id, role);


--
-- Name: idx_team_users_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_users_user_id ON public.team_users USING btree (user_id);


--
-- Name: idx_teams_org_node_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_teams_org_node_id ON public.teams USING btree (org_node_id);


--
-- Name: idx_users_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_active ON public.users USING btree (active);


--
-- Name: idx_users_active_orgnode_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_active_orgnode_name ON public.users USING btree (active, org_node_id, first_name, last_name, username);


--
-- Name: idx_users_org_node_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_org_node_id ON public.users USING btree (org_node_id);


--
-- Name: products_sku_code_uk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX products_sku_code_uk ON public.products USING btree (sku_code) WHERE (sku_code IS NOT NULL);


--
-- Name: training_company_settings_company_not_null_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX training_company_settings_company_not_null_idx ON public.training_company_settings USING btree (company_id) WHERE (company_id IS NOT NULL);


--
-- Name: training_company_settings_singleton_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX training_company_settings_singleton_idx ON public.training_company_settings USING btree (((company_id IS NULL))) WHERE (company_id IS NULL);


--
-- Name: training_scores_user_topic_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX training_scores_user_topic_created_idx ON public.training_scores USING btree (user_id, topic_key, created_at DESC);


--
-- Name: training_topics_company_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX training_topics_company_order_idx ON public.training_topics USING btree (company_id, order_index);


--
-- Name: training_topics_company_topic_key_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX training_topics_company_topic_key_uniq ON public.training_topics USING btree (company_id, topic_key) WHERE (company_id IS NOT NULL);


--
-- Name: training_topics_topic_key_singleton; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX training_topics_topic_key_singleton ON public.training_topics USING btree (topic_key) WHERE (company_id IS NULL);


--
-- Name: uniq_open_credit_per_customer_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_open_credit_per_customer_code ON public.credit_sale_requests USING btree (customer_code) WHERE (final_status = ANY (ARRAY['pending_controls'::text, 'pending_approvals'::text, 'approved'::text]));


--
-- Name: users_telegram_id_uk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_telegram_id_uk ON public.users USING btree (telegram_id) WHERE ((telegram_id IS NOT NULL) AND (telegram_id <> ''::text));


--
-- Name: ux_training_company_settings_company; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_training_company_settings_company ON public.training_company_settings USING btree (company_id) WHERE (company_id IS NOT NULL);


--
-- Name: app_roles trg_app_roles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_roles_updated_at BEFORE UPDATE ON public.app_roles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: automation_ai_prompts trg_automation_ai_prompts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_automation_ai_prompts_updated_at BEFORE UPDATE ON public.automation_ai_prompts FOR EACH ROW EXECUTE FUNCTION public.update_automation_ai_updated_at();


--
-- Name: automation_ai_settings trg_automation_ai_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_automation_ai_settings_updated_at BEFORE UPDATE ON public.automation_ai_settings FOR EACH ROW EXECUTE FUNCTION public.update_automation_ai_updated_at();


--
-- Name: org_node_edges trg_bria_edges_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bria_edges_sync AFTER INSERT OR DELETE OR UPDATE ON public.org_node_edges FOR EACH STATEMENT EXECUTE FUNCTION public.bria_after_edges_sync();


--
-- Name: org_nodes trg_bria_org_nodes_to_edges; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bria_org_nodes_to_edges AFTER INSERT OR UPDATE OF parent_id ON public.org_nodes FOR EACH ROW EXECUTE FUNCTION public.bria_org_nodes_to_edges();


--
-- Name: org_node_edges trg_bria_prevent_org_cycle; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bria_prevent_org_cycle BEFORE INSERT OR UPDATE ON public.org_node_edges FOR EACH ROW EXECUTE FUNCTION public.bria_prevent_org_cycle();


--
-- Name: credit_sale_requests trg_credit_sale_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_credit_sale_requests_updated_at BEFORE UPDATE ON public.credit_sale_requests FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at();


--
-- Name: credit_settlement_requests trg_credit_settlement_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_credit_settlement_requests_updated_at BEFORE UPDATE ON public.credit_settlement_requests FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at();


--
-- Name: org_credit_policy trg_org_credit_policy_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_credit_policy_updated_at BEFORE UPDATE ON public.org_credit_policy FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at();


--
-- Name: report_catalog trg_report_catalog_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_report_catalog_updated_at BEFORE UPDATE ON public.report_catalog FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: report_widget_catalog trg_report_widget_catalog_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_report_widget_catalog_updated_at BEFORE UPDATE ON public.report_widget_catalog FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: training_company_settings trg_training_company_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_training_company_settings_updated_at BEFORE UPDATE ON public.training_company_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: training_topics trg_training_topics_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_training_topics_updated_at BEFORE UPDATE ON public.training_topics FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: user_team_assignment trg_user_team_assignment_propagate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_user_team_assignment_propagate AFTER INSERT OR UPDATE OF team_id ON public.user_team_assignment FOR EACH ROW EXECUTE FUNCTION public.trg_user_team_assignment_propagate_fn();


--
-- Name: user_training_state trg_user_training_state_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_user_training_state_updated_at BEFORE UPDATE ON public.user_training_state FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: voice_enrollment trg_voice_enrollment_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_voice_enrollment_updated_at BEFORE UPDATE ON public.voice_enrollment FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: ai_api_prompts ai_api_prompts_topic_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_api_prompts
    ADD CONSTRAINT ai_api_prompts_topic_key_fkey FOREIGN KEY (topic_key) REFERENCES public.ai_api_topics(topic_key) ON DELETE CASCADE;


--
-- Name: app_roles app_roles_parent_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_roles
    ADD CONSTRAINT app_roles_parent_role_id_fkey FOREIGN KEY (parent_role_id) REFERENCES public.app_roles(id) ON DELETE SET NULL;


--
-- Name: app_users app_users_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.app_users(id) ON DELETE SET NULL;


--
-- Name: app_users app_users_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.app_roles(id) ON DELETE SET NULL;


--
-- Name: automation_item_logs automation_item_logs_action_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_item_logs
    ADD CONSTRAINT automation_item_logs_action_by_user_id_fkey FOREIGN KEY (action_by_user_id) REFERENCES public.users(id);


--
-- Name: automation_item_logs automation_item_logs_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_item_logs
    ADD CONSTRAINT automation_item_logs_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.automation_items(id) ON DELETE CASCADE;


--
-- Name: automation_item_recipients automation_item_recipients_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_item_recipients
    ADD CONSTRAINT automation_item_recipients_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.automation_items(id) ON DELETE CASCADE;


--
-- Name: automation_item_recipients automation_item_recipients_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_item_recipients
    ADD CONSTRAINT automation_item_recipients_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: automation_items automation_items_approver_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_items
    ADD CONSTRAINT automation_items_approver_user_id_fkey FOREIGN KEY (approver_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: automation_items automation_items_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_items
    ADD CONSTRAINT automation_items_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: automation_items automation_items_parent_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_items
    ADD CONSTRAINT automation_items_parent_item_id_fkey FOREIGN KEY (parent_item_id) REFERENCES public.automation_items(id) ON DELETE SET NULL;


--
-- Name: automation_items automation_items_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_items
    ADD CONSTRAINT automation_items_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.automation_topics(id) ON DELETE SET NULL;


--
-- Name: brands brands_manager_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_manager_user_id_fkey FOREIGN KEY (manager_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: catalog_items catalog_items_parent_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_items
    ADD CONSTRAINT catalog_items_parent_key_fkey FOREIGN KEY (parent_key) REFERENCES public.catalog_items(key) ON DELETE SET NULL;


--
-- Name: credit_requests credit_requests_guarantor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_requests
    ADD CONSTRAINT credit_requests_guarantor_user_id_fkey FOREIGN KEY (guarantor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: credit_requests credit_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_requests
    ADD CONSTRAINT credit_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: credit_sale_requests credit_sale_requests_approver1_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_sale_requests
    ADD CONSTRAINT credit_sale_requests_approver1_node_id_fkey FOREIGN KEY (approver1_node_id) REFERENCES public.org_nodes(id) ON DELETE SET NULL;


--
-- Name: credit_sale_requests credit_sale_requests_approver1_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_sale_requests
    ADD CONSTRAINT credit_sale_requests_approver1_user_id_fkey FOREIGN KEY (approver1_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: credit_sale_requests credit_sale_requests_approver2_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_sale_requests
    ADD CONSTRAINT credit_sale_requests_approver2_node_id_fkey FOREIGN KEY (approver2_node_id) REFERENCES public.org_nodes(id) ON DELETE SET NULL;


--
-- Name: credit_sale_requests credit_sale_requests_approver2_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_sale_requests
    ADD CONSTRAINT credit_sale_requests_approver2_user_id_fkey FOREIGN KEY (approver2_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: credit_sale_requests credit_sale_requests_finance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_sale_requests
    ADD CONSTRAINT credit_sale_requests_finance_user_id_fkey FOREIGN KEY (finance_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: credit_sale_requests credit_sale_requests_requester_org_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_sale_requests
    ADD CONSTRAINT credit_sale_requests_requester_org_node_id_fkey FOREIGN KEY (requester_org_node_id) REFERENCES public.org_nodes(id) ON DELETE SET NULL;


--
-- Name: credit_sale_requests credit_sale_requests_requester_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_sale_requests
    ADD CONSTRAINT credit_sale_requests_requester_user_id_fkey FOREIGN KEY (requester_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: credit_sale_requests credit_sale_requests_seller_org_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_sale_requests
    ADD CONSTRAINT credit_sale_requests_seller_org_node_id_fkey FOREIGN KEY (seller_org_node_id) REFERENCES public.org_nodes(id) ON DELETE SET NULL;


--
-- Name: credit_sale_requests credit_sale_requests_seller_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_sale_requests
    ADD CONSTRAINT credit_sale_requests_seller_user_id_fkey FOREIGN KEY (seller_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: credit_settlement_requests credit_settlement_requests_credit_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_settlement_requests
    ADD CONSTRAINT credit_settlement_requests_credit_request_id_fkey FOREIGN KEY (credit_request_id) REFERENCES public.credit_sale_requests(id) ON DELETE CASCADE;


--
-- Name: credit_settlement_requests credit_settlement_requests_decided_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_settlement_requests
    ADD CONSTRAINT credit_settlement_requests_decided_by_user_id_fkey FOREIGN KEY (decided_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: credit_settlement_requests credit_settlement_requests_finance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_settlement_requests
    ADD CONSTRAINT credit_settlement_requests_finance_user_id_fkey FOREIGN KEY (finance_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: credit_settlement_requests credit_settlement_requests_requested_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_settlement_requests
    ADD CONSTRAINT credit_settlement_requests_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: customer_industries customer_industries_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_industries
    ADD CONSTRAINT customer_industries_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.customer_industries(id) ON DELETE SET NULL;


--
-- Name: customers customers_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_type_id_fkey FOREIGN KEY (type_id) REFERENCES public.customer_types(id);


--
-- Name: debts debts_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: exercises exercises_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercises
    ADD CONSTRAINT exercises_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: forgotten_key_products forgotten_key_products_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forgotten_key_products
    ADD CONSTRAINT forgotten_key_products_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: forgotten_key_products forgotten_key_products_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forgotten_key_products
    ADD CONSTRAINT forgotten_key_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: forgotten_key_products forgotten_key_products_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forgotten_key_products
    ADD CONSTRAINT forgotten_key_products_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: org_credit_policy org_credit_policy_approver1_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_credit_policy
    ADD CONSTRAINT org_credit_policy_approver1_node_id_fkey FOREIGN KEY (approver1_node_id) REFERENCES public.org_nodes(id) ON DELETE RESTRICT;


--
-- Name: org_credit_policy org_credit_policy_approver2_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_credit_policy
    ADD CONSTRAINT org_credit_policy_approver2_node_id_fkey FOREIGN KEY (approver2_node_id) REFERENCES public.org_nodes(id) ON DELETE RESTRICT;


--
-- Name: org_credit_policy org_credit_policy_finance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_credit_policy
    ADD CONSTRAINT org_credit_policy_finance_user_id_fkey FOREIGN KEY (finance_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_credit_policy org_credit_policy_org_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_credit_policy
    ADD CONSTRAINT org_credit_policy_org_node_id_fkey FOREIGN KEY (org_node_id) REFERENCES public.org_nodes(id) ON DELETE CASCADE;


--
-- Name: org_node_catalog_mode org_node_catalog_mode_org_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_node_catalog_mode
    ADD CONSTRAINT org_node_catalog_mode_org_node_id_fkey FOREIGN KEY (org_node_id) REFERENCES public.org_nodes(id) ON DELETE CASCADE;


--
-- Name: org_node_edges org_node_edges_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_node_edges
    ADD CONSTRAINT org_node_edges_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.org_nodes(id) ON DELETE CASCADE;


--
-- Name: org_node_edges org_node_edges_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_node_edges
    ADD CONSTRAINT org_node_edges_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.org_nodes(id) ON DELETE RESTRICT;


--
-- Name: org_node_item_access org_node_item_access_item_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_node_item_access
    ADD CONSTRAINT org_node_item_access_item_key_fkey FOREIGN KEY (item_key) REFERENCES public.catalog_items(key) ON DELETE CASCADE;


--
-- Name: org_node_item_access org_node_item_access_org_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_node_item_access
    ADD CONSTRAINT org_node_item_access_org_node_id_fkey FOREIGN KEY (org_node_id) REFERENCES public.org_nodes(id) ON DELETE CASCADE;


--
-- Name: org_nodes org_nodes_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_nodes
    ADD CONSTRAINT org_nodes_parent_fk FOREIGN KEY (parent_id) REFERENCES public.org_nodes(id) ON DELETE RESTRICT;


--
-- Name: org_nodes org_nodes_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_nodes
    ADD CONSTRAINT org_nodes_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.org_nodes(id) ON DELETE RESTRICT;


--
-- Name: products products_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE RESTRICT;


--
-- Name: report_widget_catalog report_widget_catalog_report_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_widget_catalog
    ADD CONSTRAINT report_widget_catalog_report_key_fkey FOREIGN KEY (report_key) REFERENCES public.report_catalog(key) ON DELETE CASCADE;


--
-- Name: system_admin_audit_log system_admin_audit_log_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_admin_audit_log
    ADD CONSTRAINT system_admin_audit_log_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.system_admins(id) ON DELETE SET NULL;


--
-- Name: system_admin_otps system_admin_otps_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_admin_otps
    ADD CONSTRAINT system_admin_otps_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.system_admins(id) ON DELETE CASCADE;


--
-- Name: tbl_products tbl_products_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_products
    ADD CONSTRAINT tbl_products_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.tbl_brands(id);


--
-- Name: tbl_sales_managers tbl_sales_managers_senior_sales_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_managers
    ADD CONSTRAINT tbl_sales_managers_senior_sales_manager_id_fkey FOREIGN KEY (senior_sales_manager_id) REFERENCES public.tbl_senior_sales_managers(id);


--
-- Name: tbl_sellers tbl_sellers_supervisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sellers
    ADD CONSTRAINT tbl_sellers_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES public.tbl_supervisors(id);


--
-- Name: tbl_senior_sales_managers tbl_senior_sales_managers_brand_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_senior_sales_managers
    ADD CONSTRAINT tbl_senior_sales_managers_brand_manager_id_fkey FOREIGN KEY (brand_manager_id) REFERENCES public.tbl_brand_managers(id);


--
-- Name: tbl_supervisors tbl_supervisors_sales_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_supervisors
    ADD CONSTRAINT tbl_supervisors_sales_manager_id_fkey FOREIGN KEY (sales_manager_id) REFERENCES public.tbl_sales_managers(id);


--
-- Name: team_brands team_brands_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_brands
    ADD CONSTRAINT team_brands_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;


--
-- Name: team_brands team_brands_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_brands
    ADD CONSTRAINT team_brands_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: team_users team_users_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_users
    ADD CONSTRAINT team_users_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: team_users team_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_users
    ADD CONSTRAINT team_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: teams teams_org_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_org_node_id_fkey FOREIGN KEY (org_node_id) REFERENCES public.org_nodes(id) ON DELETE SET NULL;


--
-- Name: training_scores training_scores_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_scores
    ADD CONSTRAINT training_scores_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_confirmations user_confirmations_confirmed_by_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_confirmations
    ADD CONSTRAINT user_confirmations_confirmed_by_node_id_fkey FOREIGN KEY (confirmed_by_node_id) REFERENCES public.org_nodes(id) ON DELETE SET NULL;


--
-- Name: user_confirmations user_confirmations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_confirmations
    ADD CONSTRAINT user_confirmations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_priorities user_priorities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_priorities
    ADD CONSTRAINT user_priorities_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_product_mentions user_product_mentions_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_product_mentions
    ADD CONSTRAINT user_product_mentions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: user_product_mentions user_product_mentions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_product_mentions
    ADD CONSTRAINT user_product_mentions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_team_assignment user_team_assignment_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_team_assignment
    ADD CONSTRAINT user_team_assignment_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: user_team_assignment user_team_assignment_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_team_assignment
    ADD CONSTRAINT user_team_assignment_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_training_state user_training_state_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_training_state
    ADD CONSTRAINT user_training_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: users users_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: users users_org_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_org_node_id_fkey FOREIGN KEY (org_node_id) REFERENCES public.org_nodes(id);


--
-- Name: voice_enrollment voice_enrollment_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_enrollment
    ADD CONSTRAINT voice_enrollment_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: voice_logs voice_logs_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_logs
    ADD CONSTRAINT voice_logs_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: voice_logs voice_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_logs
    ADD CONSTRAINT voice_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


